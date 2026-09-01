/* global instantsearch algoliasearch */

app({
  // appId: 'latency',
  // apiKey: '6be0576ff61c053d5f9a3225e2a90f76',
  // indexName: 'instant_search',
  // searchParameters: {
  //   hitsPerPage: 10,
  // },

  server: 'http://localhost:80', // or your self-hosted seekstorm_server URL
  apiKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  indexId: 0,   // SeekStorm indices are addressed by ID, not name
  indexName: 'instant_search',          // keep for widget wiring / routing
  // searchParameters: { hitsPerPage: 10 },

});

function app(opts) {
  // const search = instantsearch({
  //   searchClient: algoliasearch(opts.appId, opts.apiKey),
  //   indexName: opts.indexName,
  //   routing: true,
  //   searchFunction: opts.searchFunction,
  // });

  const seekStormAdapter = new SeekStormInstantSearchAdapter({
    server: opts.server,
    apiKey: opts.apiKey,
    indexId: opts.indexId,
  });

  const search = instantsearch({
    searchClient: seekStormAdapter.searchClient,
    indexName: opts.indexName,
    routing: true,
  });

  search.addWidgets([
    instantsearch.widgets.searchBox({
      container: '#search-input',
      placeholder: 'Search for products',
    }),
    instantsearch.widgets.hits({
      container: '#hits',
      templates: {
        item: getTemplate('hit'),
        empty: getTemplate('no-results'),
      },
    }),
    instantsearch.widgets.stats({
      container: '#stats',
    }),
    instantsearch.widgets.sortBy({
      container: '#sort-by',
      items: [
        {
          value: opts.indexName,
          label: 'Most relevant',
        },
        {
          value: `${opts.indexName}_price_asc`,
          label: 'Lowest price',
        },
        {
          value: `${opts.indexName}_price_desc`,
          label: 'Highest price',
        },
      ],
    }),
    instantsearch.widgets.pagination({
      container: '#pagination',
      scrollTo: '#search-input',
    }),
    instantsearch.widgets.refinementList({
      container: '#category',
      attribute: 'categories',
      operator: 'or',
      templates: {
        header: getHeader('Category'),
      },
    }),
    instantsearch.widgets.refinementList({
      container: '#brand',
      attribute: 'brand',
      operator: 'or',
      searchForFacetValues: {
        placeholder: 'Search for brands',
        templates: {
          noResults: '<div class="sffv_no-results">No matching brands.</div>',
        },
      },
      templates: {
        header: getHeader('Brand'),
      },
    }),
    instantsearch.widgets.rangeSlider({
      container: '#price',
      attribute: 'price',
      templates: {
        header: getHeader('Price'),
      },
    }),
    instantsearch.widgets.refinementList({
      container: '#type',
      attribute: 'type',
      operator: 'and',
      templates: {
        header: getHeader('Type'),
      },
    }),
  ]);

  search.start();
}

function getTemplate(templateName) {
  return document.querySelector(`#${templateName}-template`).innerHTML;
}

function getHeader(title) {
  return `<h5>${title}</h5>`;
}
