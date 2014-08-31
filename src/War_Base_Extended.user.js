// ==UserScript==
// @name        War Base Extended
// @namespace   vinkuun.warBaseExtended
// @author      Vinkuun [1791283]
// @description Brings back the old war base layout, adds a filter to the war base, enables enemy tagging
// @include     *.torn.com/factions.php?step=your*
// @version     2.3.0
// @grant       none
// @require     http://cdnjs.cloudflare.com/ajax/libs/lodash.js/2.4.1/lodash.min.js
// ==/UserScript==

// TODO: update mechanism: changelog/localStorage clean up

'use strict';

var $MAIN = $('#faction-main');

var ENEMY_TAGS = {
  tbd: {text: 'Not set'},
  easy: {text: 'Easy', color:'rgba(161, 248, 161, 1)'},
  medium: {text: 'Medium', color:'rgba(231, 231, 104, 1)'},
  impossible: {text: 'Impossible', color:'rgba(242, 140, 140, 1)'}
};

var enemyTags = JSON.parse(localStorage.vinkuunEnemyTags || '{}');

// ============================================================================
// --- Helper functions
// ============================================================================

/**
 * Adds CSS to the HEAD of the document
 * @param {string} css
 */
function addCss(css) {
  var head = document.head,
    style = document.createElement('style');

  style.type = 'text/css';
  style.appendChild(document.createTextNode(css));

  head.appendChild(style);
}

// ============================================================================
// --- Personal stats helper function
// ============================================================================

/**
 * Returns the personal stats of a player
 * @param  {String} id         ID of the player
 * @param  {Function} callback Function which should be called after the stats have been read
 */
function getPersonalStats(id, callback) {
  var stats = {};

  $.ajax({
    type: 'GET',
    url: 'personalstats.php?ID=' + id,
    success: function(page) {
      var $page = $(page);

      var stats = {};

      $page.find('.statistic ul.right li').each(function() {
        var name = this.children[0].innerHTML;
        name = name.slice(0, name.length - 1); // remove colon

        stats[name] = this.children[1].textContent;
      });

      callback(stats);
    }
  });
}

// ============================================================================
// --- FEATURE: War Base Layout
// ============================================================================
function enableWarBaseLayout() {
  addCss(
    '.oldWarBase .f-war-list { margin-top: 10px }' +
    '.oldWarBase .f-war-list > li, .oldWarBase .f-war-list > li.first-in-row { margin: 10px 0; padding: 0; height: auto; width: auto }' +
    '.oldWarBase .f-war-list > li .status-wrap { display: none }' +
    '.oldWarBase .f-war-list > li .desc-wrap { display: block !important }' +
    '.oldWarBase .first-in-row { margin: 0; padding: 0 }'
  );

  $MAIN.addClass('oldWarBase');
}

// ============================================================================
// --- FEATURE: Collapsible war base
// ============================================================================
function makeWarBaseCollapsible() {
  var $warList = $('.f-war-list');
  var $statusElement = $('<p>', {text: 'The war base is currently hidden. Click the bar above to show it.', style: 'text-align: center; margin-top: 4px; font-weight: bold'}).hide();

  $('.f-msg')
  .css('cursor', 'pointer')
  .on('click', function() {
    if (shouldHideWarBase()) {
      localStorage.vinkuunHideWarBase = false;
      $warList.show();
      $statusElement.hide();
    } else {
      localStorage.vinkuunHideWarBase = true;
      $warList.hide();
      $statusElement.show();
    }})
  .attr('title', 'Click to show/hide the war base')
  .after($statusElement);

  if (shouldHideWarBase()) {
    $warList.hide();
    $statusElement.show();
  }
}

// returns true if the layout is enabled, false if not
function shouldHideWarBase() {
  return JSON.parse(localStorage.vinkuunHideWarBase || 'false');
}

// ============================================================================
// --- FEATURE: War base filter
// ============================================================================
function FilterManager(options) {
  var _filters = {};
  var _rows = [];
  var _config = JSON.parse(localStorage[options.configKey] || '{}');

  var that = this;

  this.showRow = options.showRow;
  this.hideRow = options.hideRow;

  this.$hiddenCount = $('<span>', {text: 0});

  /**
   * Applies a list of filters to the rows
   * @param  {array} filters Filters to apply
   */
  var applyFilters = function(activeFilters) {
    var numOfHiddenRows = 0;

    _(_rows).forEach(function(row) {
      // apply each supplied filter
      _(activeFilters).each(function(filter) {
        if (filter.test(row.rowData, _config[filter.id])) {
          row.activeFilters[filter.id] = true;
        } else {
          delete row.activeFilters[filter.id];
        }
      });

      if (_.keys(row.activeFilters).length === 0) {
        // show the row if no filter applies to it
        that.showRow(row.originalRow);
      } else {
        // hide the row if there is at least one filter applying to it
        that.hideRow(row.originalRow);

        numOfHiddenRows++;
      }
    });

    that.$hiddenCount.text(numOfHiddenRows);
  };

  this.trigger = function(filterId) {
    applyFilters([_filters[filterId]]);
  };

  this.triggerAll = function() {
    applyFilters(_.values(_filters));
  };

  this.registerFilter = function(id, testFunction, initialConfig) {
    if (_config[id] === undefined) {
      _config[id] = initialConfig;
    }

    _filters[id] = new Filter(id, testFunction);
  };

  this.rowToData = options.rowToData || function(row) { return row; };

  this.addRow = function(row) {
    _rows.push({
      rowData: that.rowToData(row),
      originalRow: row,
      activeFilters: {}
    });
  };

  /**
   * 1. Returns the config of a filter, if called with only the 1st argument
   * 2. If both arguments are supplied: updates the filter config
   * 
   * @param  {String} id                    filter id
   * @param  {Object|Function} filterConfig new filter config, or function which manipulates the config
   * @return {Object}                       current filter config
   */
  this.config = function(id, filterConfig) {
    if (filterConfig === undefined) {
      return _config[id];
    } else {
      if (typeof filterConfig === 'function') {
        filterConfig(_config[id]);
      } else {
        _config[id] = filterConfig; // TODO: alte config erweitern
      }
      
      // save config to localStorage
      localStorage[options.configKey] = JSON.stringify(_config);
    }
  };
}

function Filter(id, test) {
  this.id = id;
  this.test = test;
}

/**
 * Adds the filter panel to the war base extended main panel
 * @param {jQuery-Object} $panel Main panel
 */
function addWarBaseFilter($panel) {
  addCss(
    '#vinkuun-extendedWarBasePanel { line-height: 2em }' +
    '#vinkuun-extendedWarBasePanel label { background-color: rgba(200, 195, 195, 1); padding: 2px; margin: 0 4px; border: 1px solid #fff; border-radius: 5px }' +
    '#vinkuun-extendedWarBasePanel input { margin-right: 5px; vertical-align: text-bottom }' +
    '#vinkuun-extendedWarBasePanel input[type="number"] { vertical-align: baseline; line-height: 1.3em }' +
    '#vinkuun-extendedWarBasePanel { padding: 4px; }'
  );

  var filterManager = new FilterManager({
    rowToData: function(row) {
      var data = {};

      data.id = row.children[0].children[2].children[0].href.match(/XID=(\d+)/)[1];
      data.status = row.children[3].children[0].textContent;

      if (data.status === 'Hospital') {
        data.hospitalTimeLeft = parseRemainingHospitalTime(row.children[1].querySelector('#icon15').title);
      }

      return data;
    },
    showRow: function(rowElement) {
      rowElement.style.display = 'block';
    },
    hideRow: function(rowElement) {
      rowElement.style.display = 'none';
    },
    configKey: 'vinkuun.warBase.filters'
  });

  filterManager.registerFilter('statusOk',
    function(player, config) {
      return config.active && player.status === 'Okay';
    },
    {active: false}
  );

  filterManager.registerFilter('statusTraveling',
    function(player, config) {
      return config.active && player.status === 'Traveling';
    },
    {active: false}
  );

  filterManager.registerFilter('statusHospital',
    function(player, config) {
      return config.active && player.status === 'Hospital' && config.hospitalTimeLeft < player.hospitalTimeLeft;
    },
    {active: false, hospitalTimeLeft: ''}
  );

  filterManager.registerFilter('difficulty',
    function(player, config) {
      var playerDifficulty = enemyTags[player.id] || 'tbd';

      return config[playerDifficulty] || false;
    },
    {}
  );

  // FILTER: status = ok
  var $statusOkFilter = $('<label>', {text: 'okay'}).prepend(
    $('<input>', {type: 'checkbox', checked: filterManager.config('statusOk').active})
      .on('change', function() {
        filterManager.config('statusOk', {active: this.checked});
        filterManager.trigger('statusOk');
      })
  );

  // FILTER: status = traveling
  var $statusTravelingFilter = $('<label>', {text: 'traveling'}).prepend(
    $('<input>', {type: 'checkbox', checked: filterManager.config('statusTraveling').active})
      .on('change', function() {
        filterManager.config('statusTraveling', {active: this.checked});
        filterManager.trigger('statusTraveling');
      })
  );

  // FILTER: status = hospital
  var $statusHospitalFilter = $('<label>', {text: 'in hospital for more than ', title: 'Leave this field blank to disable this filter'})
    .append(
      $('<input>', {type: 'number', style: 'width: 50px', value: filterManager.config('statusHospital').hospitalTimeLeft})
        .on('change', function() {
          if (isNaN(this.value)) {
            filterManager.config('statusHospital', {active: false, hospitalTimeLeft: ''});
          } else {
            filterManager.config('statusHospital', {active: true, hospitalTimeLeft: parseInt(this.value, 10)});
          }

          filterManager.trigger('statusHospital');
        }))
    .append(' minutes');

  // FILTER: difficulty
  var $difficultyFilter = $('<p>', {text: 'Hide enemies with a difficulty of '});
  var changeCallback = function() {
    var checkbox = this;
    filterManager.config('difficulty', function(filterConfig) {
      filterConfig[checkbox.value] = checkbox.checked;
    });
    filterManager.trigger('difficulty');
  };
  _(ENEMY_TAGS).forEach(function(tag, difficulty) {
    $difficultyFilter.append(
      $('<label>', {text: tag.text})
        .append(
          $('<input>', {type: 'checkbox', value: difficulty, checked: filterManager.config('difficulty')[difficulty] || false})
            .on('change', changeCallback)
        )
    );
  });

  $panel
    .append($('<p>', {text: 'Hide enemies who are '})
      .append($statusOkFilter).append(' or ')
      .append($statusTravelingFilter).append(' or ')
      .append($statusHospitalFilter))
    .append($difficultyFilter)
    .append($personalStatsFilter)
    .append($('<p>', {text: ' enemies are hidden by the filter.'}).prepend(filterManager.$hiddenCount));

  // add each <li>-element of a player to the FilterManager
  $MAIN.find('ul.f-war-list ul.member-list > li').each(function() {
    filterManager.addRow(this);
  });

  filterManager.triggerAll();
}

/**
 * Returns the remaining hospital time in minutes
 * 
 * @param  {String} text The tooltip text of the hospital icon
 * @return {Integer}
 */
function parseRemainingHospitalTime(text) {
  var match = text.match(/<br>(\d{2}):(\d{2}):/);

  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

// ============================================================================
// --- FEATURE: Enemy tagging
// ============================================================================
 
function addEnemyTagging() {
  addCss(
    'select.vinkuun-enemyDifficulty { font-size: 12px; vertical-align: text-bottom }' +
    '.member-list li div.status, .member-list li div.act-cont { font-weight: bold }'
  );

  $MAIN.find('.member-list > li').each(function() {
    var $this = $(this);

    var id = $this.find('.user.name').eq(0).attr('href').match(/XID=(\d+)/)[1];

    $this.find('.member-icons').prepend(createDropdown($this, id));
  });
}

function createDropdown($li, id) {
  var $dropdown = $('<select>', {'class': 'vinkuun-enemyDifficulty'}).on('change', function() {
    enemyTags[id] = this.value;

    localStorage.vinkuunEnemyTags = JSON.stringify(enemyTags);

    updateColor($li, id);
  });

  $.each(ENEMY_TAGS, function(key, value) {
    var $el = $('<option>', {value: key, text: value.text});

    if (enemyTags[id] && key === enemyTags[id]) {
      $el.attr('selected', 'selected');
    }

    $dropdown.append($el);
  });

  updateColor($li, id);

  return $dropdown;
}

function updateColor($li, id) {
  if (enemyTags[id]) {
    // set a color or remove this rule
    $li.css('background-color', ENEMY_TAGS[enemyTags[id]].color || '');
  }
}

// ============================================================================
// --- MAIN
// ============================================================================

/**
 * Shows/Hides the control panel according to the current tab
 * @param {jQuery-Object} $element control panel
 */
function addUrlChangeCallback($element) {
  var urlChangeCallback = function () {
    if (window.location.hash === '#/tab=main' || window.location.hash === '') {
      $element.show();
    } else {
      $element.hide();
    }
  };

  // call it one time to show/hide the panel after the page has been loaded
  urlChangeCallback();

  // listen to a hash change
  window.onhashchange = urlChangeCallback;
}

/**
 * Initialises the script's features
 */
function init() {
  var $warBaseExtendedPanel = $('#vinkuun-extendedWarBasePanel');

  if ($warBaseExtendedPanel.length !== 0) {
    $warBaseExtendedPanel.empty();
  } else {
    $warBaseExtendedPanel = $('<div>', { id:'vinkuun-extendedWarBasePanel' });
    $MAIN.before($warBaseExtendedPanel);
  }

  var $title = $('<div>', { 'class': 'title-black m-top10 title-toggle tablet active top-round', text: 'War Base Extended' });
  $MAIN.before($title);

  var $panel = $('<div>', { 'class': 'cont-gray10 bottom-round cont-toggle' });
  $MAIN.before($panel);

  $warBaseExtendedPanel.append($title).append($panel);

  enableWarBaseLayout();
  makeWarBaseCollapsible();
  addWarBaseFilter($panel);
  addEnemyTagging();

  addUrlChangeCallback($warBaseExtendedPanel);
}


try {
  // observer used to apply the filter after the war base was loaded via ajax
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      // The war base has been added to the div
      if (mutation.addedNodes.length === 18) {
        init();
      }
    });
  });

  // start listening for changes
  observer.observe($MAIN[0], { childList: true });
} catch (err) {
  console.log(err);
}
