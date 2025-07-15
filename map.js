// Initialisiere Karte
const map = L.map('map').setView([53.55, 9.99], 11);
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

// 1. Lade JSON mit Zusatzinfos
let stolperJson = [];
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

        // Suche in stolperJson nach passendem Namen
        let jsonEintrag = stolperJson.find(j =>
          j.name && name && j.name.trim().toLowerCase() === name.trim().toLowerCase()
        );

        // Popup-Text: OSM/Overpass + ggf. Zusatzinfos aus JSON
        let popupText = `<strong>${name}</strong><br>`;
        if (address) popupText += `${address}<br>`;
        if (birth) popupText += `Geboren: ${birth}<br>`;
        if (death) popupText += `Gestorben: ${death}<br>`;
        if (victimType) popupText += `Opfer: ${victimType}<br>`;
        if (info) popupText += `<em>${info}</em><br>`;

        if (jsonEintrag) {
          if (jsonEintrag.adresse && jsonEintrag.adresse !== address) popupText += `Adresse: ${jsonEintrag.adresse}<br>`;
          if (jsonEintrag.info && jsonEintrag.info !== info) popupText += `<em>${jsonEintrag.info}</em><br>`;
          if (jsonEintrag.anmerkung) popupText += `${jsonEintrag.anmerkung}<br>`;
          if (jsonEintrag.quelle) popupText += `<a href="${jsonEintrag.quelle}" target="_blank">Quelle</a>`;
        }

        L.marker([el.lat, el.lon], { icon: redPin })
          .bindPopup(popupText, { maxWidth: 250 })
          .addTo(cluster);
      });
    });
}