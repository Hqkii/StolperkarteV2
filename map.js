// Initialisiere Karte
const map = L.map('map').setView([53.55, 9.99], 11);
window.map = map;

L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  { attribution: '© OSM, Carto', maxZoom: 18 }
).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

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

// Hilfsfunktion: Marker-Farbe basierend auf letztem Putzdatum
function getMarkerColor(lastCleaned) {
  if (!lastCleaned) return '#d00'; // Rot: nie geputzt
  const daysSince = Math.floor((Date.now() - new Date(lastCleaned)) / (1000 * 60 * 60 * 24));
  if (daysSince <= 30) return '#0a0'; // Grün: innerhalb 30 Tage
  if (daysSince <= 90) return '#fa0'; // Orange: 30-90 Tage
  return '#d00'; // Rot: über 90 Tage
}

// Erstelle Pin-Icon mit dynamischer Farbe
function createPinIcon(color) {
  return L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
      <path fill="${color}" stroke="#900" stroke-width="1" d="M12 0C7 0 3 4 3 9c0 6.5 9 27 9 27s9-20.5 9-27c0-5-4-9-9-9z"/>
      <circle fill="#fff" cx="12" cy="9" r="4"/>
    </svg>`,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36]
  });
}

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

let stolperJson = [];
let allSearchMarkers = [];

// Lade Putzdaten aus Storage
async function loadCleaningData(stoneId) {
  try {
    const result = await window.storage.get(`cleaning:${stoneId}`);
    return result ? JSON.parse(result.value) : null;
  } catch (e) {
    return null;
  }
}

// Speichere Putzdaten
async function saveCleaningData(stoneId, data) {
  try {
    await window.storage.set(`cleaning:${stoneId}`, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Fehler beim Speichern:', e);
    return false;
  }
}

// Putz-Formular anzeigen
function showCleaningForm(stoneId, marker) {
  const overlay = document.createElement('div');
  overlay.className = 'cleaning-overlay';
  overlay.innerHTML = `
    <div class="cleaning-form">
      <h3>Stolperstein reinigen</h3>
      <label>Datum der Reinigung: <span style="color: #d00;">*</span></label>
      <input type="date" id="cleaning-date" value="${new Date().toISOString().split('T')[0]}" required>
      <label>Kommentar (optional):</label>
      <textarea id="cleaning-comment" placeholder="z.B. mit Wasser und Bürste gereinigt"></textarea>
      <label>Foto hochladen (optional):</label>
      <input type="file" id="cleaning-image" accept="image/*" onchange="checkImageSize(this)">
      <div id="image-warning" style="display:none; color:#d00; font-size:0.9em; margin-top:5px;">
        ⚠️ Bild ist zu groß. Bitte wählen Sie ein kleineres Bild (max. 2MB).
      </div>
      <div class="cleaning-buttons">
        <button class="btn-save" onclick="submitCleaning('${stoneId}', '${marker._leaflet_id}')">Speichern</button>
        <button class="btn-cancel" onclick="this.closest('.cleaning-overlay').remove()">Abbrechen</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

// Bildgröße prüfen
window.checkImageSize = function(input) {
  const warning = document.getElementById('image-warning');
  if (input.files && input.files[0]) {
    const fileSize = input.files[0].size / 1024 / 1024; // in MB
    if (fileSize > 2) {
      warning.style.display = 'block';
      input.value = ''; // Datei zurücksetzen
    } else {
      warning.style.display = 'none';
    }
  }
};

// Putz-Daten absenden
window.submitCleaning = async function(stoneId, markerId) {
  const dateInput = document.getElementById('cleaning-date');
  const date = dateInput.value;
  
  if (!date) {
    alert('Bitte geben Sie ein Datum ein.');
    return;
  }
  
  const comment = document.getElementById('cleaning-comment').value;
  const imageFile = document.getElementById('cleaning-image').files[0];
  
  let imageData = null;
  
  // Bild ist optional
  if (imageFile) {
    try {
      const reader = new FileReader();
      imageData = await new Promise((resolve, reject) => {
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
    } catch (error) {
      console.error('Fehler beim Lesen des Bildes:', error);
      alert('Fehler beim Verarbeiten des Bildes. Die Daten werden ohne Bild gespeichert.');
      imageData = null;
    }
  }
  
  const cleaningData = {
    date: date,
    comment: comment || '',
    image: imageData,
    timestamp: Date.now()
  };
  
  try {
    const saved = await saveCleaningData(stoneId, cleaningData);
    if (saved) {
      alert('Reinigung erfolgreich gespeichert!');
      document.querySelector('.cleaning-overlay').remove();
      // Seite neu laden um Marker-Farbe zu aktualisieren
      location.reload();
    } else {
      // Versuch ohne Bild, falls das Bild zu groß war
      if (imageData) {
        cleaningData.image = null;
        const savedWithoutImage = await saveCleaningData(stoneId, cleaningData);
        if (savedWithoutImage) {
          alert('Reinigung gespeichert (Bild war zu groß und wurde nicht gespeichert).');
          document.querySelector('.cleaning-overlay').remove();
          location.reload();
        } else {
          throw new Error('Speichern fehlgeschlagen');
        }
      } else {
        throw new Error('Speichern fehlgeschlagen');
      }
    }
  } catch (error) {
    console.error('Fehler beim Speichern:', error);
    alert('Fehler beim Speichern. Bitte versuchen Sie es erneut oder wählen Sie ein kleineres Bild.');
  }
};

fetch('stolpersteine.json')
  .then(r => r.json())
  .then(data => { stolperJson = data; })
  .finally(loadOverpass);

async function loadOverpass() {
  const query = `[out:json][timeout:180];
    area["name"="Hamburg"]["admin_level"="4"]->.a;
    node(area.a)["memorial"="stolperstein"];
    out body;`;

  fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query))
    .then(res => res.json())
    .then(async osm => {
      for (const el of osm.elements) {
        if (!el.lat || !el.lon) continue;
        const t = el.tags || {};
        const name = t.name || t.inscription || 'Stolperstein';
        const street = t["addr:street"] || '';
        const houseNum = t["addr:housenumber"] || '';
        const address = [street, houseNum].filter(Boolean).join(' ');
        const info = t["memorial:info"] || '';
        
        const stoneId = `stone-${el.id}`;
        
        let jsonEintrag = stolperJson.find(j => {
          if (!j.name || !name) return false;
          return normalizeName(j.name) === normalizeName(name);
        });

        // Lade Putzdaten
        const cleaningData = await loadCleaningData(stoneId);
        const markerColor = getMarkerColor(cleaningData?.date);

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
          popupText += `<div class="popup-address">Adresse: ${jsonEintrag.adresse}</div>`;
        } else if (address) {
          popupText += `<div class="popup-address">Adresse: ${address}</div>`;
        }
        
        // Putzdaten anzeigen
        if (cleaningData) {
          const cleanDate = new Date(cleaningData.date).toLocaleDateString('de-DE');
          popupText += `<div class="cleaning-info">
            <strong>Zuletzt geputzt:</strong> ${cleanDate}`;
          if (cleaningData.comment) {
            popupText += `<br><em>${cleaningData.comment}</em>`;
          }
          if (cleaningData.image) {
            popupText += `<br><img src="${cleaningData.image}" class="cleaning-image" alt="Reinigungsfoto">`;
          }
          popupText += `</div>`;
        } else {
          popupText += `<div class="cleaning-info">Noch nicht geputzt</div>`;
        }
        
        // Putz-Button
        popupText += `<button class="btn-clean" onclick="showCleaningForm('${stoneId}', window.currentMarker)">🧹 Stolperstein putzen</button>`;
        
        if (jsonEintrag && jsonEintrag.anmerkung)
          popupText += `<div class="popup-note">${jsonEintrag.anmerkung}</div>`;
        
        let sliderValue = 50;
        if (name) {
          let hash = 0;
          for (let i = 0; i < name.length; i++) {
            hash = ((hash << 5) - hash) + name.charCodeAt(i);
            hash = hash & hash;
          }
          sliderValue = Math.abs(hash % 101);
        }
        
        popupText += `<div class="popup-slider-container">
          <div class="popup-slider-label">Gedenkintensität: <span id="slider-value-${stoneId}">${sliderValue}</span></div>
          <input type="range" min="0" max="100" value="${sliderValue}" class="popup-slider" id="slider-${stoneId}" oninput="document.getElementById('slider-value-${stoneId}').textContent = this.value">
        </div>`;
        
        if (jsonEintrag && jsonEintrag.quelle)
          popupText += `<div class="popup-source"><a href="${jsonEintrag.quelle}" target="_blank">Quelle</a></div>`;
        popupText += `</div>`;

        const marker = L.marker([el.lat, el.lon], { icon: createPinIcon(markerColor) })
          .bindPopup(popupText, { maxWidth: 370 })
          .addTo(cluster);
        
        marker.on('click', function() {
          window.currentMarker = marker;
        });

        allSearchMarkers.push({
          name: name,
          address: jsonEintrag && jsonEintrag.adresse ? jsonEintrag.adresse : address,
          marker: marker,
          lat: el.lat,
          lon: el.lon,
          info: (jsonEintrag && jsonEintrag.info) || info || "",
        });
      }

      window.getAllMarkers = function () {
        return allSearchMarkers;
      };
      window.leafletMapReady = true;
    });
}

window.showCleaningForm = showCleaningForm;