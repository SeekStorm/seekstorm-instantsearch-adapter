# SeekStorm instant search adapter

This client-side adapter allows [Algolia's InstantSearch.js, React InstantSearch, or Vue InstantSearch widgets](https://github.com/algolia/instantsearch) to be powered by [SeekStorm](https://github.com/SeekStorm/SeekStorm) as the backend engine.

```javascript
import SeekStormInstantSearchAdapter from 'seekstorm-instantsearch-adapter';
```

## SeekStorm instant search demo
This [instant search demo](https://github.com/SeekStorm/instant-search-demo) is a fork of [Algolia's instant search demo](https://github.com/algolia/instant-search-demo). It demonstrates how to uses [Algolia Instant-Search]((https://github.com/algolia/instantsearch)) to create a result page for an e-commerce website.  
The actual search results are provided via the [SeekStorm instant search adapter](https://github.com/SeekStorm/seekstorm_instant_search) by the [SeekStorm server](https://github.com/SeekStorm/SeekStorm) REST API that provides a hosted full-text, numerical and faceted search.

## How it works

instant-search-demo demo (e-commerce website)  
↓  
Algolia's InstantSearch.js  
↓  
seekstorm-instantsearch-adapter  
↓  
SeekStorm server (self-hosted or SeekStorm cloud)  


## Steps

1. Start the SeekStorm server, either after cloning the [SeekStorm repository](https://github.com/SeekStorm/SeekStorm/tree/main/seekstorm_server) and building via `cargo build --release`, or from the [Docker image](https://hub.docker.com/r/wolfgarbe/seekstorm_server).
2. Create a demo API key, using the SeekStorm server console command `create` or via the REST API.
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
        { "field": "price",       "field_type": "F64",      "store": true,  "index_lexical": false, "facet": true }
    ], 
    "index_name": "test_index",
    "similarity": "Bm25fProximity",
    "tokenizer": "UnicodeAlphanumeric"
}
```

4. Ingest the *bestbuy_dataset_light.json* dataset via the console command "ingest" or via the REST API.

```shell
ingest "C:\Users\wolfg\Documents\GitHub\seekstorm-instantsearch-adapter\instant-search-demo\dataset_import\bestbuy_dataset_light.json"
```

5. Clone this repository (includes both seekstorm-instantsearch-adapter and instant-search-demo)
6. Start the demo via instant-search-demo\index-simplified.html

7. We just demonstrated how the seekstorm-instantsearch-adapter allows you to switch any search frontend using Algolia InstantSearch.js  
from the Algolia API backend to a self-hosted SeekStorm server or the SeekStorm search-as-a-service.




