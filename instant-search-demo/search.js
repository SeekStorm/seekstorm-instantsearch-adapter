/* global instantsearch algoliasearch */

app({

// appId: 'latency',
 // apiKey: '6be0576ff61c053d5f9a3225e2a90f76',
 // indexName: 'instant_search',
 // searchParameters: {
 //    hitsPerPage: 10,
 //  },

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
      rangeType: 'CountWithinRange',
      ranges: [
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
  // ---------------------
  //
  //  Init
  //
  // ---------------------
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

  // ---------------------
  //
  //  Default widgets
  //
  // ---------------------
  search.addWidgets([
    instantsearch.widgets.searchBox({
      container: '#search-input',
      placeholder: 'Search for products by name, type, brand, ...',
    }),
    instantsearch.widgets.hits({
      container: '#hits',
      templates: {
        item: getTemplate('hit'),
        empty: getTemplate('no-results'),
      },
      transformItems(items) {
        return items.map(item => {
          /* eslint-disable no-param-reassign */
          item.starsLayout = getStarsHTML(item.rating);
          item.categories = getCategoryBreadcrumb(item);
          item.popularity = item.popularity ?? 0;
          return item;
        });
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

    // ---------------------
    //
    //  Filtering widgets
    //
    // ---------------------
    instantsearch.widgets.panel({
      templates: {
        header: getHeaderTemplate('category'),
      },
    })(instantsearch.widgets.refinementList)({
      container: '#hierarchical-categories',
      attribute: 'categories',
      limit: 10,
      showMore: true,
      showMoreLimit: 20,
      templates: {
        showMoreText: `
          {{#isShowingMore}}
            <span class="isShowingLess"></span>
            Show less
          {{/isShowingMore}}
          {{^isShowingMore}}
            <span class="isShowingMore"></span>
            Show more
          {{/isShowingMore}}
        `,
      },
    }),
    instantsearch.widgets.panel({
      templates: {
        header: getHeaderTemplate('brand'),
      },
    })(instantsearch.widgets.refinementList)({
      container: '#brand',
      attribute: 'brand',
      limit: 5,
      showMore: true,
      showMoreLimit: 10,
      searchable: true,
      searchablePlaceholder: 'Search for brands',
      templates: {
        searchableNoResults:
          '<div class="sffv_no-results">No matching brands.</div>',
        showMoreText: `
          {{#isShowingMore}}
            <span class="isShowingLess"></span>
            Show less
          {{/isShowingMore}}
          {{^isShowingMore}}
            <span class="isShowingMore"></span>
            Show more
          {{/isShowingMore}}
        `,
      },
    }),
    instantsearch.widgets.panel({
      templates: {
        header: getHeaderTemplate('price'),
      },
    })(instantsearch.widgets.rangeSlider)({
      container: '#price',
      attribute: 'price',
      max: 5000,
      tooltips: {
        format(rawValue) {
          return `$${Math.round(rawValue).toLocaleString()}`;
        },
      },
    }),
    instantsearch.widgets.panel({
      templates: {
        header: getHeaderTemplate('rating'),
      },
    })(instantsearch.widgets.ratingMenu)({
      container: '#stars',
      attribute: 'rating',
      max: 5,
      labels: {
        andUp: '& Up',
      },
    }),
    instantsearch.widgets.panel({
      templates: {
        header: getHeaderTemplate('shipping'),
      },
    })(instantsearch.widgets.toggleRefinement)({
      container: '#free-shipping',
      attribute: 'free_shipping',
      label: 'Free Shipping',
      values: {
        on: true,
      },
    }),
    instantsearch.widgets.panel({
      templates: {
        header: getHeaderTemplate('type'),
      },
    })(instantsearch.widgets.menu)({
      container: '#type',
      attribute: 'type',
      limit: 10,
      showMore: true,
      sortBy: ['isRefined', 'count:desc', 'name:asc'],
      templates: {
        showMoreText: `
          {{#isShowingMore}}
            <span class="isShowingLess"></span>
            Show less
          {{/isShowingMore}}
          {{^isShowingMore}}
            <span class="isShowingMore"></span>
            Show more
          {{/isShowingMore}}
        `,
      },
    }),
  ]);

  search.start();
}

// ---------------------
//
//  Helper functions
//
// ---------------------
function getTemplate(templateName) {
  return document.querySelector(`#${templateName}-template`).innerHTML;
}

function getHeaderTemplate(name) {
  return `<div class="ais-header"><h5>${name}</h5></div>`;
}

function getCategoryBreadcrumb(item) {
  const highlightValues = item._highlightResult.categories || [];
  return highlightValues.map(category => category.value).join(' > ');
}

function getStarsHTML(rating, maxRating) {
  let html = '';
  const newRating = maxRating || 5;
  const currentRating = Number(rating) || 0;

  for (let i = 0; i < newRating; ++i) {
    html += `<i class="fa fa-star${i < currentRating ? '' : '-o'}"></i>`;
  }

  return html;
}
