class SeekStormInstantSearchAdapter {
  constructor(config) {
    this.host = config.host || 'http://localhost:8000';
    this.apiKey = config.apiKey;
  }

  // The core method Algolia's UI widgets invoke automatically
  async search(requests) {
    // 1. Map Algolia multi-requests to SeekStorm structures
    const seekStormQueries = requests.map(req => this.mapAlgoliaToSeekStorm(req));

    try {
      // 2. Fire requests to SeekStorm Server concurrently using native fetch
      const responses = await Promise.all(
        seekStormQueries.map(q => 
          fetch(`${this.host}/api/v1/indices/${q.index}/query`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(q.payload)
          }).then(res => {
            if (!res.ok) {
              throw new Error(`SeekStorm error! Status: ${res.status}`);
            }
            return res.json(); // Parse the response body as JSON
          })
        )
      );

      // 3. Format the data back into what Algolia UI expects
      return {
        results: responses.map((data, index) => this.mapSeekStormToAlgolia(data, requests[index]))
      };
    } catch (error) {
      console.error("SeekStorm Adapter Search Failed:", error);
      throw error;
    }
  }

  mapAlgoliaToSeekStorm(algoliaRequest) {
    const params = algoliaRequest.params || {};
    const page = params.page || 0;
    const hitsPerPage = params.hitsPerPage || 20;

    return {
      index: algoliaRequest.indexName,
      payload: {
        query_string: params.query || "*", 
        offset: page * hitsPerPage,         
        length: hitsPerPage,                
        facets: params.facets ? params.facets.map(f => ({ field: f })) : [] 
      }
    };
  }

  mapSeekStormToAlgolia(seekStormData, algoliaRequest) {
    const hitsPerPage = algoliaRequest.params.hitsPerPage || 20;
    
    return {
      hits: seekStormData.hits.map(h => ({
        objectID: h._id, // Map SeekStorm's native _id directly to Algolia's objectID
        _id: h._id,      
        ...h.fields     
      })),
      nbHits: seekStormData.total_results, 
      page: (algoliaRequest.params.page || 0),
      nbPages: Math.ceil(seekStormData.total_results / hitsPerPage),
      hitsPerPage: hitsPerPage,
      facets: this.formatFacets(seekStormData.facets), 
      processingTimeMS: seekStormData.time_ms || 1
    };
  }

  formatFacets(seekStormFacets) {
    const algoliaFacets = {};
    if (!seekStormFacets) return algoliaFacets;
    
    seekStormFacets.forEach(f => {
      algoliaFacets[f.field] = {};
      f.values.forEach(v => {
        algoliaFacets[f.field][v.value] = v.count;
      });
    });
    return algoliaFacets;
  }
}
