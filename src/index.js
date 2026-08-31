class SeekStormInstantSearchAdapter {
  /**
   * @param {Object} config
   * @param {string} config.host - e.g. 'http://localhost:8000'
   * @param {string} config.apiKey - SeekStorm API key
   * @param {Object} config.indexMap - maps InstantSearch indexName -> SeekStorm numeric index id
   *        e.g. { instant_search: 0 }
   * @param {Object} config.facetTypes - maps attribute name -> SeekStorm schema field_type,
   *        used to build correctly-tagged facet_filter / query_facets payloads.
   *        e.g. { brand: 'String32', categories: 'StringSet32', type: 'String32', price: 'F64' }
   * @param {boolean} [config.realtime=false] - include just-indexed, uncommitted documents
   */
  constructor(config) {
    this.host = config.host || 'http://localhost:8000';
    this.apiKey = config.apiKey;
    this.indexMap = config.indexMap || {};
    this.facetTypes = config.facetTypes || {};
    this.realtime = config.realtime ?? false;
  }

  async search(requests) {
    const seekStormQueries = requests.map((req) => this.mapAlgoliaToSeekStorm(req));

    try {
      const responses = await Promise.all(
        seekStormQueries.map((q) =>
          fetch(`${this.host}/api/v1/index/${q.indexId}/query`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              apikey: this.apiKey, // NOTE: plain header, not Authorization: Bearer
            },
            body: JSON.stringify(q.payload),
          }).then((res) => {
            if (!res.ok) {
              throw new Error(`SeekStorm error! Status: ${res.status}`);
            }
            return res.json();
          })
        )
      );

      return {
        results: responses.map((data, index) =>
          this.mapSeekStormToAlgolia(data, requests[index])
        ),
      };
    } catch (error) {
      console.error('SeekStorm Adapter Search Failed:', error);
      throw error;
    }
  }

  // Required by InstantSearch's refinementList `searchForFacetValues` option.
  // Uses query_facets' `prefix` to do a typeahead search over a single facet field's values.
  async searchForFacetValues(requests) {
    const results = await Promise.all(
      requests.map(async (req) => {
        const { facetName, facetQuery, indexName, params = {} } = req;
        const { indexId } = this.resolveIndex(indexName);
        const fieldType = this.facetTypes[facetName];
        if (!fieldType) {
          console.warn(`No facetTypes entry for "${facetName}" — cannot search facet values.`);
          return { facetHits: [] };
        }

        const payload = {
          query: params.query || '',
          offset: 0,
          length: 0, // we only want facet values, not hits
          result_type: 'Count',
          realtime: this.realtime,
          query_facets: [
            { [fieldType]: { field: facetName, prefix: facetQuery || '', length: 20 } },
          ],
        };

        const res = await fetch(`${this.host}/api/v1/index/${indexId}/query`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', apikey: this.apiKey },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`SeekStorm error! Status: ${res.status}`);
        const data = await res.json();

        // VERIFY: adjust to the real facet response shape once confirmed.
        const facetEntry = (data.facets || []).find((f) => f.field === facetName);
        const values = facetEntry?.values || [];
        return {
          facetHits: values.map((v) => ({
            value: v.value,
            count: v.count,
            highlighted: v.value,
          })),
        };
      })
    );
    return { results };
  }

  // Splits Algolia's virtual "replica" index names (used by the sortBy widget)
  // into a real SeekStorm index id + a result_sort entry.
  resolveIndex(indexName) {
    const sortSuffixes = {
      _price_asc: { field: 'price', order: 'Ascending' },
      _price_desc: { field: 'price', order: 'Descending' },
    };

    for (const [suffix, sort] of Object.entries(sortSuffixes)) {
      if (indexName.endsWith(suffix)) {
        const baseName = indexName.slice(0, -suffix.length);
        return { indexId: this.indexMap[baseName], sort };
      }
    }
    return { indexId: this.indexMap[indexName], sort: null };
  }

  mapAlgoliaToSeekStorm(algoliaRequest) {
    const params = algoliaRequest.params || {};
    const page = params.page || 0;
    const hitsPerPage = params.hitsPerPage || 20;
    const { indexId, sort } = this.resolveIndex(algoliaRequest.indexName);

    if (indexId === undefined) {
      console.warn(`No indexMap entry for "${algoliaRequest.indexName}".`);
    }

    const payload = {
      query: params.query || '',
      offset: page * hitsPerPage,
      length: hitsPerPage,
      result_type: 'TopkCount',
      realtime: this.realtime,
    };

    const facetFilter = this.buildFacetFilter(params);
    if (facetFilter.length) payload.facet_filter = facetFilter;

    const queryFacets = this.buildQueryFacets(params.facets);
    if (queryFacets.length) payload.query_facets = queryFacets;

    // VERIFY exact result_sort shape against your server before relying on this.
    if (sort) payload.result_sort = [sort];

    return { indexId, payload };
  }

  // Translates Algolia's facetFilters (["brand:Apple", ["type:Laptop","type:Tablet"]])
  // and numericFilters (["price>=10", "price<=50"]) into SeekStorm's typed facet_filter.
  buildFacetFilter(params) {
    const filters = [];
    const byField = {}; // field -> Set of accepted string values (OR within a field)

    const addStringFilter = (attr, value) => {
      byField[attr] = byField[attr] || new Set();
      byField[attr].add(value);
    };

    (params.facetFilters || []).forEach((entry) => {
      const items = Array.isArray(entry) ? entry : [entry];
      items.forEach((clause) => {
        const [attr, value] = clause.split(':');
        addStringFilter(attr, value);
      });
    });

    Object.entries(byField).forEach(([field, values]) => {
      const fieldType = this.facetTypes[field];
      if (!fieldType) {
        console.warn(`No facetTypes entry for "${field}" — skipping filter.`);
        return;
      }
      filters.push({ [fieldType]: { field, filter: Array.from(values) } });
    });

    // Numeric range filter, e.g. price rangeSlider -> ["price>=10","price<=50"]
    const numericRanges = {};
    (params.numericFilters || []).forEach((clause) => {
      const match = clause.match(/^(\w+)(>=|<=)(.+)$/);
      if (!match) return;
      const [, field, op, value] = match;
      numericRanges[field] = numericRanges[field] || [null, null];
      if (op === '>=') numericRanges[field][0] = Number(value);
      if (op === '<=') numericRanges[field][1] = Number(value);
    });

    Object.entries(numericRanges).forEach(([field, [min, max]]) => {
      const fieldType = this.facetTypes[field];
      if (!fieldType) return;
      filters.push({ [fieldType]: { field, filter: [min, max] } });
    });

    return filters;
  }

  buildQueryFacets(facetFields) {
    if (!facetFields) return [];
    return facetFields
      .map((field) => {
        const fieldType = this.facetTypes[field];
        if (!fieldType) {
          console.warn(`No facetTypes entry for "${field}" — skipping facet request.`);
          return null;
        }
        return { [fieldType]: { field, prefix: '', length: 1000 } };
      })
      .filter(Boolean);
  }

  mapSeekStormToAlgolia(seekStormData, algoliaRequest) {
    const hitsPerPage = algoliaRequest.params.hitsPerPage || 20;

    // VERIFY: field names below (hits / _id / fields / result_count / time_ms) are
    // not confirmed against a live response — check your server's actual JSON
    // and adjust these lookups accordingly.
    const rawHits = seekStormData.hits || seekStormData.results || [];
    const totalResults =
      seekStormData.result_count ?? seekStormData.total_results ?? rawHits.length;

    return {
      hits: rawHits.map((h) => ({
        objectID: h._id ?? h.id,
        _id: h._id ?? h.id,
        ...(h.fields || h),
      })),
      nbHits: totalResults,
      page: algoliaRequest.params.page || 0,
      nbPages: Math.ceil(totalResults / hitsPerPage),
      hitsPerPage,
      facets: this.formatFacets(seekStormData.facets),
      processingTimeMS: seekStormData.time_ms ?? 1,
    };
  }

  formatFacets(seekStormFacets) {
    const algoliaFacets = {};
    if (!seekStormFacets) return algoliaFacets;
    seekStormFacets.forEach((f) => {
      algoliaFacets[f.field] = {};
      (f.values || []).forEach((v) => {
        algoliaFacets[f.field][v.value] = v.count;
      });
    });
    return algoliaFacets;
  }
}