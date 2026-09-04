# SeekStorm instant search adapter

This client-side adapter allows you to use [Algolia's InstantSearch.js, React InstantSearch, or Vue InstantSearch widget library](https://github.com/algolia/instantsearch) to build modern search UI, while using [SeekStorm](https://github.com/SeekStorm/SeekStorm) as the search backend.  
It also enables you to simply switch the search backend to SeekStorm, while continue using your existing search UI based on Algolia's InstantSearch.

## Instant search demo
This [instant search demo](https://github.com/SeekStorm/seekstorm-instantsearch-adapter/tree/main/instant-search-demo) is a fork of [Algolia's instant search demo](https://github.com/algolia/instant-search-demo). It demonstrates how to uses [Algolia Instant-Search](https://github.com/algolia/instantsearch) to create a result page for an e-commerce website - but powered by the SeekStorm server backend.  
The actual search results are provided via the [SeekStorm instant search adapter](https://github.com/SeekStorm/seekstorm-instantsearch-adapter) by the [SeekStorm server](https://github.com/SeekStorm/SeekStorm) REST API that provides a vector &amp; lexical search.

| Instantsearch demo powered by Algolia | Instantsearch demo powered by SeekStorm |
| :---: | :---: |
| <img src="instant-search-demo\screenshots\instantsearch_powered_by_algolia.png"> | <img src="instant-search-demo\screenshots\instantsearch_powered_by_seekstorm.png"> |

### How it works

```
instant-search-demo (e-commerce website demo)  
            ↓  
Algolia's InstantSearch.js  
            ↓  
seekstorm-instantsearch-adapter  
            ↓  
SeekStorm server (self-hosted or SeekStorm cloud)  
            ↑
bestbuy_dataset.json (instant-search-demo\dataset_import)
```

## Modifications made

The following modifications were made to the fork of [Algolia's instant search demo](https://github.com/algolia/instant-search-demo) (located in the instant-search-demo folder of this repository) in order to switch the backend from Algolia to SeekStorm:

1. `index.html`

```html
  <!-- <script src="https://cdn.jsdelivr.net/npm/algoliasearch@4.0.3/dist/algoliasearch-lite.umd.js"></script> -->
  <script src="../src/seekstorm-instantsearch-adapter.js"></script>
```

2. `search.js`

```js
app({
  // appId: 'latency',
  // apiKey: '6be0576ff61c053d5f9a3225e2a90f76',
  // indexName: 'instant_search',
  // searchParameters: {
  //   hitsPerPage: 10,
  // },

  server: 'http://localhost:80', // seekstorm_server URL
  apiKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  indexId: 0,   // SeekStorm indices are addressed by ID, not name
  indexName: 'instant_search',    // keep for widget wiring / routing
  facetTypes: {
    brand: 'String32',
    categories: 'StringSet32',
    type: 'String32',
    price: 'F64',
    rating: 'U8',
  },
  numericFacetRanges: {
    rating: {
      rangeType: 'CountAboveRange',
      ranges: [
        { label: '0', start: 0 },
        { label: '1', start: 1 },
        { label: '2', start: 2 },
        { label: '3', start: 3 },
        { label: '4', start: 4 },
        { label: '5', start: 5 },
      ],
    },
  },

});

function app(opts) {
  // const search = instantsearch({
  //   searchClient: algoliasearch(opts.appId, opts.apiKey),
  //   indexName: opts.indexName,
  //   routing: true,
  //   searchFunction: opts.searchFunction,
  // });

  const seekStormAdapter = new SeekStormInstantSearchAdapter({
    host: opts.server,
    apiKey: opts.apiKey,
    indexMap: { [opts.indexName]: opts.indexId },
    facetTypes: opts.facetTypes,
    numericFacetRanges: opts.numericFacetRanges,
  });

  const search = instantsearch({
    searchClient: seekStormAdapter.searchClient,
    indexName: opts.indexName,
    routing: true,
  });
```

## Steps to run the demo

1. Start the SeekStorm server, either after cloning the [SeekStorm repository](https://github.com/SeekStorm/SeekStorm/tree/main/seekstorm_server) and building via `cargo build --release`, or from the [Docker image](https://hub.docker.com/r/wolfgarbe/seekstorm_server).
2. Create a demo API key, using the SeekStorm server console command `create` or via the REST API:

```shell
POST http://127.0.0.1:80/api/v1/apikey HTTP/1.1
apikey: {use master API key displayed in the server console at startup}
content-type: application/json

{
    "indices_max": 10,
    "indices_size_max": 100000, 
    "documents_max": 10000000, 
    "operations_max": 10000000, 
    "rate_limit": 100000,
    "demo": true
}
```

3. Create an index with the following schema via the REST API.

```json
POST http://127.0.0.1:80/api/v1/index HTTP/1.1
apikey: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
content-type: application/json

{
    "schema":
    [
        { "field": "objectID",    "field_type": "String32", "store": true,  "index_lexical": false },
        { "field": "name",        "field_type": "Text",     "store": true,  "index_lexical": true  },
        { "field": "description", "field_type": "Text",     "store": true,  "index_lexical": true  },
        { "field": "image",       "field_type": "String32", "store": true,  "index_lexical": false },
        { "field": "url",         "field_type": "String32", "store": true,  "index_lexical": false },
        { "field": "categories",  "field_type": "StringSet32", "store": true, "index_lexical": false, "facet": true },
        { "field": "brand",       "field_type": "String32", "store": true,  "index_lexical": false, "facet": true },
        { "field": "type",        "field_type": "String32", "store": true,  "index_lexical": false, "facet": true },
        { "field": "rating",      "field_type": "U8",      "store": true,  "index_lexical": false, "facet": true },
        { "field": "popularity",  "field_type": "U32",      "store": true,  "index_lexical": false, "facet": true  },
        { "field": "price",       "field_type": "F64",      "store": true,  "index_lexical": false, "facet": true }
    ], 
    "index_name": "test_index",
    "similarity": "Bm25fProximity",
    "tokenizer": "UnicodeAlphanumeric"
}
```

4. Clone this repository (includes both seekstorm-instantsearch-adapter and instant-search-demo)
5. Ingest the *bestbuy_dataset.json* dataset via the console command "ingest" or via the REST API.

```shell
ingest {...full local path...}\seekstorm-instantsearch-adapter\instant-search-demo\dataset_import\bestbuy_dataset.json
```

6. Start the demo by opening [instant-search-demo\index.html](instant-search-demo\index.html) in the browser.
7. We just demonstrated how the `seekstorm-instantsearch-adapter` allows you to **switch** any search frontend using Algolia InstantSearch.js 
**from the Algolia API** backend **to a self-hosted SeekStorm server** or the SeekStorm search-as-a-service.




