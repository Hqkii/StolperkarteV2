
// Initialisiere Karte
const map = L.map('map').setView([53.55, 9.99], 11);
window.map = map;

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
window.cluster = cluster;

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

// Hilfsfunktion für Namensvergleich
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
  .then(data => { 
    stolperJson = data;
    console.log(`Geladen: ${stolperJson.length} Einträge aus stolpersteine.json`);
  })
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
      const processedJsonEntries = new Set();

      console.log(`Overpass-API: ${osm.elements.length} Stolpersteine gefunden`);

      // Erst OSM-Daten verarbeiten
      osm.elements.forEach(el => {
        if (!el.lat || !el.lon) return;
        const t = el.tags || {};
        const name = t.name || t.inscription || 'Stolperstein';
        const street = t["addr:street"] || '';
        const houseNum = t["addr:housenumber"] || '';
        const address = [street, houseNum].filter(Boolean).join(' ');
        const info = t["memorial:info"] || '';

        // Suche in stolperJson nach passendem Namen
        let jsonEintrag = stolperJson.find(j => {
          if (!j.name || !name) return false;
          return normalizeName(j.name) === normalizeName(name);
        });

        if (jsonEintrag) {
          processedJsonEntries.add(jsonEintrag);
        }

        // Popup-Text erstellen
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

        allSearchMarkers.push({
          name: name,
          address: jsonEintrag && jsonEintrag.adresse ? jsonEintrag.adresse : address,
          marker: marker,
          lat: el.lat,
          lon: el.lon,
          info: (jsonEintrag && jsonEintrag.info) || info || "",
        });
      });

      console.log(`${processedJsonEntries.size} Einträge aus JSON wurden in OSM gefunden`);

      // Jetzt JSON-Einträge geocoden, die NICHT in OSM gefunden wurden
      const missingEntries = stolperJson.filter(j => !processedJsonEntries.has(j));
      console.log(`${missingEntries.length} Einträge müssen geocoded werden...`);
      
      if (missingEntries.length > 0) {
        geocodeMissingEntries(missingEntries);
      } else {
        finalizeMap();
      }
    })
    .catch(err => {
      console.error('Fehler beim Laden von Overpass-API:', err);
      // Auch bei Fehler versuchen, JSON-Daten zu geocoden
      console.log('Versuche alle JSON-Einträge zu geocoden...');
      geocodeMissingEntries(stolperJson);
    });
}

// Geocoding für fehlende Einträge
async function geocodeMissingEntries(entries) {
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.adresse) {
      console.warn(`Überspringe ${entry.name} - keine Adresse vorhanden`);
      failed++;
      continue;
    }
    
    try {
      // Nominatim API für Geocoding (mit Delay wegen Rate Limit)
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const query = `${entry.adresse}, Hamburg, Germany`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
      
      console.log(`[${i + 1}/${entries.length}] Geocode: ${entry.name}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Stolpersteine Hamburg Map (educational project)'
        }
      });
      const results = await response.json();
      
      if (results && results[0]) {
        const lat = parseFloat(results[0].lat);
        const lon = parseFloat(results[0].lon);
        
        // Popup erstellen
        let popupText = `<div class="popup-content">`;
        popupText += `<div class="popup-title">${entry.name}</div>`;
        if (entry.info) {
          popupText += `<div class="popup-description">${entry.info}</div>`;
        }
        popupText += `<div class="popup-address">Adresse : ${entry.adresse}</div>`;
        if (entry.anmerkung) {
          popupText += `<div class="popup-note">${entry.anmerkung}</div>`;
        }
        if (entry.quelle) {
          popupText += `<div class="popup-source"><a href="${entry.quelle}" target="_blank">Quelle</a></div>`;
        }
        popupText += `</div>`;
        
        const marker = L.marker([lat, lon], { icon: redPin })
          .bindPopup(popupText, { maxWidth: 370 })
          .addTo(cluster);
        
        allSearchMarkers.push({
          name: entry.name,
          address: entry.adresse,
          marker: marker,
          lat: lat,
          lon: lon,
          info: entry.info || "",
        });
        
        successful++;
        console.log(`✓ Erfolgreich: ${entry.name} @ ${entry.adresse}`);
      } else {
        failed++;
        console.warn(`✗ Nicht gefunden: ${entry.name} @ ${entry.adresse}`);
      }
    } catch (err) {
      failed++;
      console.error(`✗ Fehler bei ${entry.name}:`, err);
    }
  }
  
  console.log(`\n=== GEOCODING ABGESCHLOSSEN ===`);
  console.log(`Erfolgreich: ${successful}`);
  console.log(`Fehlgeschlagen: ${failed}`);
  console.log(`Gesamt auf Karte: ${allSearchMarkers.length}`);
  
  finalizeMap();
}

function finalizeMap() {
  window.getAllMarkers = function () {
    return allSearchMarkers;
  };
  window.leafletMapReady = true;
  console.log('Karte fertig geladen!');
}