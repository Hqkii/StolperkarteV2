(function setupSearchBar() {
  if (!window.leafletMapReady) {
    setTimeout(setupSearchBar, 300);
    return;
  }

  let data = [];
  let input = document.getElementById('searchInput');
  let resultsBox = document.getElementById('searchResults');
  let searchBar = document.getElementById('searchBar');
  let lastResults = [];
  let selected = -1;

  function normalizeName(name) {
    return name
      ? name
          .toLowerCase()
          .replace(/^dr\.?\s*/i, '')
          .replace(/\bgeb\..*$/i, '')
          .replace(/\bverh\..*$/i, '')
          .replace(/\([^)]*\)/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
  }

  if (window.getAllMarkers) {
    data = window.getAllMarkers();
  } else if (window.registerSearchMarkersCallback) {
    window.registerSearchMarkersCallback(arr => (data = arr));
  } else if (window.osmMarkerData) {
    data = window.osmMarkerData;
  } else {
    return;
  }

  function search(q) {
    q = normalizeName(q);
    if (!q) return [];
    let all = data
      .map(d => ({ ...d, n: normalizeName(d.name) }))
      .filter(d => d.n);
    let res = all.filter(d => d.n.startsWith(q));
    if (res.length < 7) {
      let more = all.filter(
        d => !res.includes(d) && d.n.indexOf(q) !== -1
      );
      res = res.concat(more);
    }
    return res.slice(0, 12);
  }

  function renderResults(results) {
    resultsBox.innerHTML = '';
    if (results.length === 0) {
      resultsBox.classList.remove('active');
      return;
    }
    results.forEach((r, i) => {
      let div = document.createElement('div');
      div.className = 'search-bar-result' + (i === selected ? ' active' : '');
      div.textContent = r.name + (r.address ? ` – ${r.address}` : '');
      div.onclick = () => selectResult(i);
      resultsBox.appendChild(div);
    });
    resultsBox.classList.add('active');
  }

  function selectResult(idx) {
    let res = lastResults[idx];
    if (!res) return;
    resultsBox.classList.remove('active');
    input.value = res.name;
    selected = idx;
    // Marker & Popup sichtbar machen, auch bei Cluster!
    if (res.marker && window.map) {
      if (window.cluster && !window.map.hasLayer(res.marker)) {
        window.cluster.zoomToShowLayer(res.marker, function() {
          window.map.setView(res.marker.getLatLng(), 18, { animate: true });
          res.marker.openPopup();
        });
      } else {
        window.map.setView(res.marker.getLatLng(), 18, { animate: true });
        res.marker.openPopup();
      }
    }
  }

  window.searchResultsUpdate = function () {
    let val = input.value.trim();
    lastResults = search(val);
    selected = -1;
    renderResults(lastResults);
  };

  window.searchBarKeyDown = function (e) {
    if (!lastResults.length) return;
    if (e.key === 'ArrowDown') {
      selected = (selected + 1) % lastResults.length;
      renderResults(lastResults);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      selected = (selected - 1 + lastResults.length) % lastResults.length;
      renderResults(lastResults);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (selected >= 0) selectResult(selected);
      else window.searchBarSubmit();
    } else if (e.key === 'Escape') {
      resultsBox.classList.remove('active');
    }
  };

  window.searchBarSubmit = function () {
    if (lastResults.length) {
      selectResult(0);
    }
    resultsBox.classList.remove('active');
  };

  document.addEventListener('click', function (e) {
    if (!searchBar.contains(e.target)) {
      resultsBox.classList.remove('active');
    }
  });

  input.addEventListener('focus', function () {
    if (lastResults.length) resultsBox.classList.add('active');
  });

  setTimeout(() => {
    if (input && window.getComputedStyle(input).display !== 'none') input.blur();
  }, 10);
})();