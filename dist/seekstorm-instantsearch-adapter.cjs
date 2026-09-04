// src/seekstorm-instantsearch-adapter.js
var SeekStormInstantSearchAdapter = class {
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
    this.host = config.host || "http://localhost:8000";
    this.apiKey = config.apiKey;
    this.indexMap = config.indexMap || {};
    this.facetTypes = config.facetTypes || {};
    this.numericFacetRanges = config.numericFacetRanges || {};
    this.realtime = config.realtime ?? false;
    this.highlightFields = config.highlightFields || ["name", "description"];
    this.numericFieldTypes = /* @__PURE__ */ new Set([
      "U8",
      "U16",
      "U32",
      "U64",
      "I8",
      "I16",
      "I32",
      "I64",
      "F32",
      "F64",
      "Timestamp"
    ]);
    this.minMaxCacheMs = config.minMaxCacheMs ?? 6e4;
    this._minMaxCache = /* @__PURE__ */ new Map();
  }
  // InstantSearch requires a `searchClient` object exposing `search`/`searchForFacetValues`.
  get searchClient() {
    return {
      search: this.search.bind(this),
      searchForFacetValues: this.searchForFacetValues.bind(this)
    };
  }
  // GET /api/v1/index/{indexId} -> read facets_minmax, with a small TTL cache
  // so we're not hitting this on every keystroke.
  async getFacetsMinMax(indexId) {
    const cached = this._minMaxCache.get(indexId);
    if (cached && Date.now() - cached.fetchedAt < this.minMaxCacheMs) {
      return cached.data;
    }
    const res = await fetch(`${this.host}/api/v1/index/${indexId}`, {
      method: "GET",
      headers: { apikey: this.apiKey }
    });
    if (!res.ok) {
      console.warn(`Failed to fetch index info for facets_minmax: ${res.status}`);
      return cached?.data || {};
    }
    const info = await res.json();
    const data = info.facets_minmax || {};
    this._minMaxCache.set(indexId, { data, fetchedAt: Date.now() });
    return data;
  }
  async search(requests) {
    try {
      const responses = await Promise.all(
        requests.map(async (request) => {
          const { indexId } = this.resolveIndex(request.indexName);
          const minMax = await this.getFacetsMinMax(indexId);
          const { payload } = this.mapAlgoliaToSeekStorm(request, minMax);
          const queryRes = await fetch(`${this.host}/api/v1/index/${indexId}/query`, {
            method: "POST",
            headers: { "content-type": "application/json", apikey: this.apiKey },
            body: JSON.stringify(payload)
          }).then((res) => {
            if (!res.ok) throw new Error(`SeekStorm error! Status: ${res.status}`);
            return res.json();
          });
          return { queryRes, minMax };
        })
      );
      return {
        results: responses.map(
          ({ queryRes, minMax }, index) => this.mapSeekStormToAlgolia(queryRes, requests[index], minMax)
        )
      };
    } catch (error) {
      console.error("SeekStorm Adapter Search Failed:", error);
      throw error;
    }
  }
  // Required by InstantSearch's refinementList `searchForFacetValues` option.
  // Uses query_facets' `prefix` to do a typeahead search over a single facet field's values.
  async searchForFacetValues(requests) {
    const results = await Promise.all(
      requests.map(async (req) => {
        const { indexName, params = {} } = req;
        const facetName = req.facetName ?? params.facetName;
        const facetQuery = req.facetQuery ?? params.facetQuery;
        const { indexId } = this.resolveIndex(indexName);
        const fieldType = this.facetTypes[facetName];
        if (!fieldType) {
          console.warn(`No facetTypes entry for "${facetName}" \u2014 cannot search facet values.`);
          return { facetHits: [] };
        }
        const prefix = (facetQuery || "").replace(/^./, (character) => character.toUpperCase());
        const payload = {
          query: params.query || "",
          offset: 0,
          length: 0,
          // we only want facet values, not hits
          result_type: "TopkCount",
          realtime: this.realtime,
          query_facets: [
            { [fieldType]: { field: facetName, prefix, length: 20 } }
          ],
          enable_empty_query: true
          // allow empty query to return all facet values
        };
        const res = await fetch(`${this.host}/api/v1/index/${indexId}/query`, {
          method: "POST",
          headers: { "content-type": "application/json", apikey: this.apiKey },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`SeekStorm error! Status: ${res.status}`);
        const data = await res.json();
        const facets = data.facets;
        const values = Array.isArray(facets) ? facets.find((f) => f.field === facetName)?.values || [] : facets?.[facetName] || [];
        return {
          facetHits: values.map((v) => ({
            value: Array.isArray(v) ? v[0] : v.value,
            count: Array.isArray(v) ? v[1] : v.count,
            highlighted: Array.isArray(v) ? v[0] : v.value
          }))
        };
      })
    );
    return results;
  }
  // Splits Algolia's virtual "replica" index names (used by the sortBy widget)
  // into a real SeekStorm index id + a result_sort entry.
  resolveIndex(indexName) {
    const sortSuffixes = {
      _price_asc: { field: "price", order: "Ascending" },
      _price_desc: { field: "price", order: "Descending" }
    };
    for (const [suffix, sort] of Object.entries(sortSuffixes)) {
      if (indexName.endsWith(suffix)) {
        const baseName = indexName.slice(0, -suffix.length);
        return { indexId: this.indexMap[baseName], sort };
      }
    }
    return { indexId: this.indexMap[indexName], sort: null };
  }
  mapAlgoliaToSeekStorm(algoliaRequest, facetsMinMax = {}) {
    const params = algoliaRequest.params || {};
    const page = params.page || 0;
    const hitsPerPage = params.hitsPerPage || 20;
    const { indexId, sort } = this.resolveIndex(algoliaRequest.indexName);
    if (indexId === void 0) {
      console.warn(`No indexMap entry for "${algoliaRequest.indexName}".`);
    }
    const payload = {
      query: params.query || "",
      offset: page * hitsPerPage,
      length: hitsPerPage,
      result_type: "TopkCount",
      realtime: this.realtime,
      enable_empty_query: true,
      // allow empty query to return all facet values
      highlights: this.highlightFields.map((field) => ({
        field,
        fragment_number: 0,
        fragment_size: 0,
        highlight_markup: true,
        name: `_instantsearch_highlight_${field}`,
        pre_tags: "__ais-highlight__",
        post_tags: "__/ais-highlight__"
      }))
    };
    const facetFilter = this.buildFacetFilter(params, facetsMinMax);
    if (facetFilter.length) payload.facet_filter = facetFilter;
    const queryFacets = this.buildQueryFacets(params.facets);
    if (queryFacets.length) payload.query_facets = queryFacets;
    if (sort) payload.result_sort = [sort];
    return { indexId, payload };
  }
  // Translates Algolia's facetFilters (["brand:Apple", ["type:Laptop","type:Tablet"]])
  // and numericFilters (["price>=10", "price<=50"]) into SeekStorm's typed facet_filter.
  buildFacetFilter(params, facetsMinMax = {}) {
    const filters = [];
    const byField = {};
    const numericSelections = {};
    const addStringFilter = (attr, value) => {
      if (this.numericFieldTypes.has(this.facetTypes[attr]) && Number.isFinite(Number(value))) {
        numericSelections[attr] = numericSelections[attr] || [];
        numericSelections[attr].push(Number(value));
        return;
      }
      byField[attr] = byField[attr] || /* @__PURE__ */ new Set();
      byField[attr].add(value);
    };
    (params.facetFilters || []).forEach((entry) => {
      const items = Array.isArray(entry) ? entry : [entry];
      items.forEach((clause) => {
        const [attr, value] = clause.split(":");
        addStringFilter(attr, value);
      });
    });
    Object.entries(byField).forEach(([field, values]) => {
      const fieldType = this.facetTypes[field];
      if (!fieldType) {
        console.warn(`No facetTypes entry for "${field}" \u2014 skipping filter.`);
        return;
      }
      filters.push({ [fieldType]: { field, filter: Array.from(values) } });
    });
    const numericRanges = {};
    (params.numericFilters || []).forEach((clause) => {
      const match = clause.match(/^(\w+)(>=|<=)(.+)$/);
      if (!match) return;
      const [, field, op, value] = match;
      numericRanges[field] = numericRanges[field] || { start: null, end: null };
      if (op === ">=") numericRanges[field].start = Number(value);
      if (op === "<=") numericRanges[field].end = Number(value);
    });
    Object.entries(numericSelections).forEach(([field, values]) => {
      numericRanges[field] = {
        start: Math.min(...values),
        end: Math.max(...values) + 1,
        inclusiveEnd: false
      };
    });
    Object.entries(numericRanges).forEach(([field, range]) => {
      const fieldType = this.facetTypes[field];
      if (!fieldType) return;
      const bounds = facetsMinMax[field];
      if (range.start === null) range.start = bounds?.min;
      if (range.end === null) range.end = bounds?.max;
      if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
        console.warn(`No numeric bounds available for "${field}" \u2014 skipping filter.`);
        return;
      }
      if (range.end !== null && range.inclusiveEnd !== false) {
        range.end += 0.01;
      }
      delete range.inclusiveEnd;
      filters.push({ [fieldType]: { field, filter: range } });
    });
    return filters;
  }
  buildQueryFacets(facetFields) {
    if (!facetFields) return [];
    const requestedFields = facetFields === "*" ? Object.keys(this.facetTypes) : Array.isArray(facetFields) ? facetFields : [];
    return requestedFields.map((field) => {
      const fieldType = this.facetTypes[field];
      if (!fieldType) {
        console.warn(`No facetTypes entry for "${field}" \u2014 skipping facet request.`);
        return null;
      }
      if (this.numericFieldTypes.has(fieldType)) {
        const rangeConfig = this.numericFacetRanges[field];
        if (!rangeConfig) return null;
        return {
          [fieldType]: {
            field,
            range_type: rangeConfig.rangeType,
            ranges: rangeConfig.ranges.map(({ label, start }) => [label, start])
          }
        };
      }
      return { [fieldType]: { field, prefix: "", length: 1e3 } };
    }).filter(Boolean);
  }
  mapSeekStormToAlgolia(seekStormData, algoliaRequest, facetsMinMax = {}) {
    const hitsPerPage = algoliaRequest.params.hitsPerPage || 20;
    const rawHits = seekStormData.hits || seekStormData.results || [];
    const totalResults = seekStormData.count_total ?? seekStormData.result_count ?? seekStormData.total_results ?? rawHits.length;
    const facetsStats = {};
    Object.entries(facetsMinMax).forEach(([field, { min, max }]) => {
      const fieldType = this.facetTypes[field];
      if (fieldType && this.numericFieldTypes.has(fieldType)) {
        facetsStats[field] = { min, max };
      }
    });
    const facets = this.formatFacets(seekStormData.facets);
    Object.keys(facetsStats).forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(facets, field)) {
        facets[field] = {};
      }
    });
    return {
      hits: rawHits.map((h) => {
        const fields = h.fields || h;
        return {
          objectID: h._id ?? h.id ?? fields.objectID,
          _id: h._id ?? h.id,
          ...fields,
          _highlightResult: {
            name: { value: this.highlightValue(fields, "name", algoliaRequest.params.query) },
            description: { value: this.highlightValue(fields, "description", algoliaRequest.params.query) }
          }
        };
      }),
      nbHits: totalResults,
      page: algoliaRequest.params.page || 0,
      nbPages: Math.ceil(totalResults / hitsPerPage),
      hitsPerPage,
      facets,
      facets_stats: facetsStats,
      processingTimeMS: seekStormData.time ? Math.round(seekStormData.time / 1e6) : seekStormData.time_ms ?? 1
    };
  }
  highlightValue(fields, field, query) {
    const value = query ? fields[`_instantsearch_highlight_${field}`] ?? fields[field] : fields[field];
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value ?? "");
    return textarea.value;
  }
  formatFacets(seekStormFacets) {
    const algoliaFacets = {};
    if (!seekStormFacets) return algoliaFacets;
    const entries = Array.isArray(seekStormFacets) ? seekStormFacets.map((f) => [f.field, f.values || []]) : Object.entries(seekStormFacets);
    entries.forEach(([field, values]) => {
      algoliaFacets[field] = {};
      (values || []).forEach((v) => {
        const value = Array.isArray(v) ? v[0] : v.value;
        const count = Array.isArray(v) ? v[1] : v.count;
        if (value !== null && value !== void 0 && String(value).trim() !== "") {
          algoliaFacets[field][value] = count;
        }
      });
    });
    return algoliaFacets;
  }
};
var seekstorm_instantsearch_adapter_default = SeekStormInstantSearchAdapter;

// scripts/commonjs.js
module.exports = seekstorm_instantsearch_adapter_default;
