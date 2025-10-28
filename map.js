// Initialisiere Karte
const map = L.map('map').setView([53.55, 9.99], 11);
window.map = map; // Für search.js

L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  { attribution: '© OSM, Carto', maxZoom: 18 }
).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Cluster-Optionen
const cluster = L.markerClusterGroup({
  maxClusterRadius: 80,
  iconCreateFunction: cluster => L.divIcon({
    html: `<span>${cluster.getChildCount()}</span>`,
    className: 'stoneSquare',
    iconSize: L.point(46, 46),
    iconAnchor: [23, 23],
  }),
});
map.addLayer(cluster);
window.cluster = cluster; // Damit die Suchfunktion Cluster öffnen kann!

// Rotes Stecknadel-Icon als SVG
const redPin = L.divIcon({
  className: '',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
    <path fill="#d00" stroke="#900" stroke-width="1" d="M12 0C7 0 3 4 3 9c0 6.5 9 27 9 27s9-20.5 9-27c0-5-4-9-9-9z"/>
    <circle fill="#fff" cx="12" cy="9" r="4"/>
  </svg>`,
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [0, -36]
});

// Hilfsfunktion für Namensvergleich: entfernt Titel, "geb.", "verh." und Klammern
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

// 1. Lade JSON mit Zusatzinfos
let stolperJson = [];
let allSearchMarkers = [];
fetch('stolpersteine.json')
  .then(r => r.json())
  .then(data => { stolperJson = data; })
  .finally(loadOverpass);

// 2. Lade Overpass/OSM und merge per Name
function loadOverpass() {
  const query = `[out:json][timeout:180];
    area["name"="Hamburg"]["admin_level"="4"]->.a;
    node(area.a)["memorial"="stolperstein"];
    out body;`;

  fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query))
    .then(res => res.json())
    .then(osm => {
      osm.elements.forEach(el => {
        if (!el.lat || !el.lon) return;
        const t = el.tags || {};
        const name = t.name || t.inscription || 'Stolperstein';
        const street = t["addr:street"] || '';
        const houseNum = t["addr:housenumber"] || '';
        const address = [street, houseNum].filter(Boolean).join(' ');
        const birth = t["memorial:birth_date"] || t["birth_date"] || '';
        const death = t["memorial:death_date"] || t["death_date"] || '';
        const victimType = t["memorial:victim_of"] || '';
        const info = t["memorial:info"] || '';

        // Suche in stolperJson nach passendem Namen (tolerant gegenüber "Dr.", "geb.", "verh.", Klammern)
        let jsonEintrag = stolperJson.find(j => {
          if (!j.name || !name) return false;
          return normalizeName(j.name) === normalizeName(name);
        });

        // Popup-Text: EXAKT wie im Screenshot
        let popupText = `<div class="popup-content">`;

        if (name) {
          popupText += `<div class="popup-title">${name}</div>`;
          let beschreibung = '';
          if (jsonEintrag && jsonEintrag.info) beschreibung = jsonEintrag.info;
          if (!beschreibung && info) beschreibung = info;
          if (beschreibung) {
            popupText += `<div class="popup-description">${beschreibung}</div>`;
          }
        }
        if (jsonEintrag && jsonEintrag.adresse) {
          popupText += `<div class="popup-address">Adresse : ${jsonEintrag.adresse}</div>`;
        } else if (address) {
          popupText += `<div class="popup-address">Adresse : ${address}</div>`;
        }
        if (jsonEintrag && jsonEintrag.anmerkung)
          popupText += `<div class="popup-note">${jsonEintrag.anmerkung}</div>`;
        if (jsonEintrag && jsonEintrag.quelle)
          popupText += `<div class="popup-source"><a href="${jsonEintrag.quelle}" target="_blank">Quelle</a></div>`;
        popupText += `</div>`;

        const marker = L.marker([el.lat, el.lon], { icon: redPin })
          .bindPopup(popupText, { maxWidth: 370 })
          .addTo(cluster);

        // Für Suchfunktion
        allSearchMarkers.push({
          name: name,
          address: jsonEintrag && jsonEintrag.adresse ? jsonEintrag.adresse : address,
          marker: marker,
          lat: el.lat,
          lon: el.lon,
          info: (jsonEintrag && jsonEintrag.info) || info || "",
        });
      });

      window.getAllMarkers = function () {
        return allSearchMarkers;
      };
      window.leafletMapReady = true;
    });
}