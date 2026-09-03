
Instant-Search Demo
====================

This [instant search demo](https://github.com/SeekStorm/seekstorm-instantsearch-adapter/tree/main/instant-search-demo) is a fork of [Algolia's instant search demo](https://github.com/algolia/instant-search-demo). It demonstrates how to uses [Algolia Instant-Search](https://github.com/algolia/instantsearch) to create a result page for an e-commerce website - but powered by the SeekStorm server backend.  
The actual search results are provided via the [SeekStorm instant search adapter](https://github.com/SeekStorm/seekstorm-instantsearch-adapter) by the [SeekStorm server](https://github.com/SeekStorm/SeekStorm) REST API that provides a vector &amp; lexical search.

| Instantsearch demo powered by Algolia | Instantsearch demo powered by SeekStorm |
| :---: | :---: |
| <img src="screenshots\instantsearch_powered_by_algolia.png"> | <img src="screenshots\instantsearch_powered_by_seekstorm.png"> |

### Simplified version
This project also includes a simplified version of the implementation that includes a few less filtering options.
The code is available in the files `index-simplified.html` and `search-simplified.js`. 

## Features
* Full-JavaScript/frontend implementation based on [instantsearch.js](https://community.algolia.com/instantsearch.js/)
* Results page refreshed as you type
* Relevant results from the first keystroke
* Rich set of filters
  * Multi-level categories
  * Range slider
  * Star rating
* Typo-tolerance
* Multiple sort orders
  * By Relevance
  * By Highest Price
  * By Lowest Price
* Backup search parameters in the URL


We've extracted 20 000+ products from the [Best Buy Developer API](https://developer.bestbuy.com). You can find the associated documentation [here](https://developer.bestbuy.com/documentation/products-api).

## Tutorial

**Follow this [step by step tutorial](https://www.algolia.com/doc/tutorials/search-ui/instant-search/build-an-instant-search-results-page/instantsearchjs/) (on Algolia.com) to learn how this implementation works** and how it has been built using the [instantsearch.js library](https://community.algolia.com/instantsearch.js/).

A more general overview of filtering and faceting is available in a [dedicated tutorial](https://www.algolia.com/doc/tutorials/search-ui/instant-search/filtering/faceting-search-ui/instantsearchjs/).

