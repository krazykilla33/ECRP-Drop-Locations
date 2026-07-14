(() => {
  "use strict";

  const STORAGE_KEY = "ecrp-drop-location-coordinates-v2";
  const EDIT_PASSCODE = "2468";
  const sourceLocations = Array.isArray(window.DROP_LOCATIONS) ? window.DROP_LOCATIONS : [];
  function normalizeStyleCoords(mapValue = {}) {
    // Backward compatibility: old {x, y} data is treated as satellite data.
    const legacySatellite = Number.isFinite(mapValue?.x) && Number.isFinite(mapValue?.y)
      ? { x: mapValue.x, y: mapValue.y }
      : { x: null, y: null };

    return {
      satellite: {
        x: mapValue?.satellite?.x ?? legacySatellite.x,
        y: mapValue?.satellite?.y ?? legacySatellite.y
      },
      atlas: {
        x: mapValue?.atlas?.x ?? null,
        y: mapValue?.atlas?.y ?? null
      }
    };
  }

  const locations = sourceLocations.map(item => ({
    ...item,
    helper: item.helper || "",
    image: item.image || "",
    map: normalizeStyleCoords(item.map)
  }));

  const mapConfigs = {
    "san-andreas": {
      label: "San Andreas",
      width: 2048,
      height: 2048,
      satellite: "assets/map/san-andreas-satellite.jpg",
      atlas: "assets/map/san-andreas-atlas.png"
    },
    cayo: {
      label: "Cayo Perico",
      width: 1920,
      height: 1920,
      satellite: "assets/map/cayo-satellite.jpg",
      atlas: "assets/map/cayo-atlas.jpg"
    }
  };

  let currentRegion = "san-andreas";
  let currentStyle = "satellite";
  let currentFilter = "all";
  let selectedId = null;
  let editMode = false;
  let imageOverlay = null;
  let mapBounds = null;

  const markerLayer = L.layerGroup();
  const markerMap = new Map();

  const map = L.map("dropMap", {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 4,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90,
    attributionControl: false,
    maxBoundsViscosity: 0.85
  });
  markerLayer.addTo(map);

  function createHintImageUi() {
  if (!document.getElementById("dropHintImageStyles")) {
    const style = document.createElement("style");

    style.id = "dropHintImageStyles";

    style.textContent = `
      .location-card-content {
        display: block;
        min-width: 0;
      }

      .location-hint-image {
        display: block;
        width: 100%;
        height: 150px;
        margin-top: 10px;
        object-fit: cover;
        object-position: center;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 9px;
        background: #080d14;
        cursor: zoom-in;
        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.3);
      }

      .popup-hint-image {
        display: block;
        width: 260px;
        height: 150px;
        max-width: 100%;
        margin-top: 9px;
        object-fit: cover;
        object-position: center;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        background: #080d14;
        cursor: zoom-in;
      }

      .image-lightbox {
        position: fixed;
        inset: 0;
        z-index: 5000;
        display: grid;
        place-items: center;
        padding: 38px;
        background: rgba(0, 0, 0, 0.92);
        backdrop-filter: blur(7px);
      }

      .image-lightbox.hidden {
        display: none !important;
      }

      .lightbox-image {
        display: block;
        max-width: min(92vw, 1500px);
        max-height: 90vh;
        object-fit: contain;
        border-radius: 4px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.8);
      }

      .lightbox-close {
        position: fixed;
        z-index: 5001;
        top: 16px;
        right: 18px;
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: rgba(20, 25, 34, 0.88);
        color: #ffffff;
        font-size: 30px;
        line-height: 1;
        cursor: pointer;
      }

      .lightbox-close:hover {
        background: rgba(49, 214, 199, 0.22);
      }

      body.lightbox-open {
        overflow: hidden;
      }

      @media (max-width: 700px) {
        .image-lightbox {
          padding: 52px 12px 12px;
        }

        .lightbox-image {
          max-width: 96vw;
          max-height: 86vh;
        }
      }
    `;

    document.head.appendChild(style);
  }

  if (!document.getElementById("imageLightbox")) {
    const lightbox = document.createElement("div");

    lightbox.id = "imageLightbox";
    lightbox.className = "image-lightbox hidden";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", "Location hint image");

    lightbox.innerHTML = `
      <button
        id="closeLightboxBtn"
        class="lightbox-close"
        type="button"
        aria-label="Close image"
      >
        ×
      </button>

      <img
        id="lightboxImage"
        class="lightbox-image"
        src=""
        alt=""
      />
    `;

    document.body.appendChild(lightbox);
  }
}

createHintImageUi();

  const els = {
    sanAndreasBtn: document.getElementById("sanAndreasBtn"),
    cayoBtn: document.getElementById("cayoBtn"),
    satelliteBtn: document.getElementById("satelliteBtn"),
    atlasBtn: document.getElementById("atlasBtn"),
    editModeBtn: document.getElementById("editModeBtn"),
    editorPanel: document.getElementById("editorPanel"),
    dropSearch: document.getElementById("dropSearch"),
    clearSearchBtn: document.getElementById("clearSearchBtn"),
    showAllBtn: document.getElementById("showAllBtn"),
    showMappedBtn: document.getElementById("showMappedBtn"),
    showUnmappedBtn: document.getElementById("showUnmappedBtn"),
    locationCount: document.getElementById("locationCount"),
    dropList: document.getElementById("dropList"),
    emptyState: document.getElementById("emptyState"),
    placementBanner: document.getElementById("placementBanner"),
    copyDataBtn: document.getElementById("copyDataBtn"),
    downloadDataBtn: document.getElementById("downloadDataBtn"),
    resetLocalBtn: document.getElementById("resetLocalBtn"),
    imageLightbox: document.getElementById("imageLightbox"),
    lightboxImage: document.getElementById("lightboxImage"),
    closeLightboxBtn: document.getElementById("closeLightboxBtn")
  };

  function getCoords(location, style = currentStyle) {
    return location?.map?.[style] || null;
  }

  function isMapped(location, style = currentStyle) {
    const coords = getCoords(location, style);
    return Number.isFinite(coords?.x) && Number.isFinite(coords?.y);
  }

  function loadSavedCoordinates() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      locations.forEach(location => {
        const savedMap = saved[location.id];
        if (!savedMap) return;
        ["satellite", "atlas"].forEach(style => {
          const coords = savedMap[style];
          if (coords && Number.isFinite(coords.x) && Number.isFinite(coords.y)) {
            location.map[style] = { x: coords.x, y: coords.y };
          }
        });
      });
    } catch (error) {
      console.warn("Could not load saved drop-location coordinates.", error);
    }
  }

  function saveCoordinates() {
    const output = {};
    locations.forEach(location => {
      const savedMap = {};
      ["satellite", "atlas"].forEach(style => {
        if (isMapped(location, style)) {
          const coords = getCoords(location, style);
          savedMap[style] = { x: coords.x, y: coords.y };
        }
      });
      if (Object.keys(savedMap).length) output[location.id] = savedMap;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(output));
  }

  function getRegionLocations() {
    return locations
      .filter(location => location.region === currentRegion)
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
          numeric: true
        })
      );
  }

  function getVisibleLocations() {
    const query = els.dropSearch.value.trim().toLowerCase();
    return getRegionLocations().filter(location => {
      const matchesSearch = !query || `${location.name} ${location.helper}`.toLowerCase().includes(query);
      const mapped = isMapped(location);
      const matchesFilter = currentFilter === "all" || (currentFilter === "mapped" && mapped) || (currentFilter === "unmapped" && !mapped);
      return matchesSearch && matchesFilter;
    });
  }

  function markerIcon(selected = false) {
   const fill = selected ? "#f2b84b" : "#31d6c7";

   return L.divIcon({
     className: "drop-marker-wrap",
     html: `
       <svg
         class="drop-marker-svg"
         width="28"
         height="36"
         viewBox="0 0 28 36"
         aria-hidden="true"
       >
         <path
           d="M14 1
              C6.8 1 1 6.8 1 14
              C1 23.2 14 35 14 35
              C14 35 27 23.2 27 14
              C27 6.8 21.2 1 14 1Z"
           fill="${fill}"
           stroke="#ffffff"
           stroke-width="2.5"
         />

         <circle
           cx="14"
           cy="14"
           r="5"
           fill="#082321"
         />
       </svg>
     `,
     iconSize: [28, 36],
     iconAnchor: [14, 35],
     popupAnchor: [0, -34]
   });
 }

  function hintImageHtml(src, location, className) {
    return `
      <img
        class="${className}"
        src="${escapeHtml(src)}"
        alt="Hint for ${escapeHtml(location.name)}"
        loading="lazy"
        data-lightbox-image="${escapeHtml(src)}"
        data-lightbox-alt="Hint for ${escapeHtml(location.name)}"
      />
    `;
  }
  
  function popupHtml(location) {
    const coords = getCoords(location);

    return `
      <div class="popup-name">${escapeHtml(location.name)}</div>

      ${
        location.helper
          ? `<div class="popup-helper">${escapeHtml(location.helper)}</div>`
          : ""
      }

      ${
        location.image
          ? hintImageHtml(
              location.image,
              location,
              "popup-hint-image"
            )
          : ""
      }

      ${
        editMode && coords
          ? `
            <div class="popup-coords">
              ${currentStyle.toUpperCase()}
              — X: ${coords.x} &nbsp; Y: ${coords.y}
            </div>
          `
          : ""
      }
    `;
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    markerMap.clear();

    getRegionLocations().forEach(location => {
      const coords = getCoords(location);
      if (!isMapped(location)) return;
      const marker = L.marker([coords.y, coords.x], {
        icon: markerIcon(location.id === selectedId),
        keyboard: true,
        title: location.name
      }).addTo(markerLayer);

      marker.bindPopup(popupHtml(location), { closeButton: true, autoPanPadding: [40, 80] });
      marker.on("click", () => selectLocation(location.id, { focus: true, scroll: true, popup: true }));
      markerMap.set(location.id, marker);
    });
  }

  function renderList() {
    const visible = getVisibleLocations();
    els.dropList.innerHTML = "";
    els.emptyState.classList.toggle("hidden", visible.length !== 0);
    els.locationCount.textContent = `${visible.length} / ${getRegionLocations().length}`;

    visible.forEach(location => {
      const mapped = isMapped(location);
      const card = document.createElement("button");
      card.type = "button";
      card.id = `drop-${location.id}`;
      card.className = `location-card${mapped ? " mapped" : ""}${location.id === selectedId ? " active" : ""}`;
      card.innerHTML = `
        <span class="pin" aria-hidden="true">⌖</span>

        <span class="location-card-content">
          <span class="location-name">
            ${escapeHtml(location.name)}
          </span>

          ${
            location.helper
              ? `
                <span class="location-helper">
                  ${escapeHtml(location.helper)}
                </span>
              `
              : ""
          }

          ${
            location.image && location.id === selectedId
              ? hintImageHtml(
                  location.image,
                  location,
                  "location-hint-image"
                )
              : ""
          }
        </span>

        <span class="location-state">
          ${mapped ? "MAPPED" : "UNMAPPED"}
        </span>
      `;
      card.addEventListener("click", () => selectLocation(location.id, { focus: mapped, scroll: false, popup: mapped }));
      els.dropList.appendChild(card);
    });
  }

  function renderAll() {
    renderMarkers();
    renderList();
    updatePlacementBanner();
  }

  function selectLocation(id, options = {}) {
    const location = locations.find(item => item.id === id);
    if (!location) return;

    if (location.region !== currentRegion) setRegion(location.region, false);
    selectedId = id;
    renderMarkers();
    renderList();
    updatePlacementBanner();

    const marker = markerMap.get(id);
    if (options.focus && isMapped(location)) {
      const targetZoom = Math.max(map.getZoom(), currentRegion === "cayo" ? 1 : 0.75);
      const coords = getCoords(location);
      map.flyTo([coords.y, coords.x], targetZoom, { duration: 0.65 });
    }
    if (options.popup && marker) setTimeout(() => marker.openPopup(), options.focus ? 650 : 0);
    if (options.scroll) document.getElementById(`drop-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function updatePlacementBanner() {
    if (!editMode) {
      els.placementBanner.classList.add("hidden");
      return;
    }
    const location = locations.find(item => item.id === selectedId);
    els.placementBanner.classList.remove("hidden");
    els.placementBanner.textContent = location
      ? `Click the ${currentStyle} map to ${isMapped(location) ? "move" : "place"} “${location.name}”.`
      : "Select a location from the list, then click the map to place its marker.";
  }

  function setRegion(region, fit = true) {
    if (!mapConfigs[region]) return;
    currentRegion = region;
    selectedId = locations.find(item => item.id === selectedId)?.region === region ? selectedId : null;
    els.sanAndreasBtn.classList.toggle("active", region === "san-andreas");
    els.cayoBtn.classList.toggle("active", region === "cayo");
    updateOverlay(fit);
    renderAll();
  }

  function setStyle(style) {
    if (style !== "satellite" && style !== "atlas") return;
    currentStyle = style;
    els.satelliteBtn.classList.toggle("active", style === "satellite");
    els.atlasBtn.classList.toggle("active", style === "atlas");
    updateOverlay(false);
    renderAll();
  }

  function updateOverlay(fit) {
    const config = mapConfigs[currentRegion];

    // Leaflet throws if getCenter() is called before the first view is set.
    const hasView = map._loaded === true;
    const center = hasView ? map.getCenter() : null;
    const zoom = hasView ? map.getZoom() : null;

    if (imageOverlay) map.removeLayer(imageOverlay);

    mapBounds = [[0, 0], [config.height, config.width]];
    imageOverlay = L.imageOverlay(config[currentStyle], mapBounds, { interactive: false }).addTo(map);
    imageOverlay.bringToBack();
    map.setMaxBounds([[-config.height * .2, -config.width * .2], [config.height * 1.2, config.width * 1.2]]);

    if (fit || !hasView) {
      map.fitBounds(mapBounds, { animate: false });
    } else {
      map.setView(center, zoom, { animate: false });
    }
  }

  function setFilter(filter) {
    currentFilter = filter;
    ["all", "mapped", "unmapped"].forEach(name => {
      const button = name === "all" ? els.showAllBtn : name === "mapped" ? els.showMappedBtn : els.showUnmappedBtn;
      button.classList.toggle("active", name === filter);
    });
    renderList();
  }

  function toggleEditMode() {
    if (!editMode) {
      const enteredPasscode = prompt("Enter the editor passcode:");

      if (enteredPasscode === null) {
        return;
      }

      if (enteredPasscode !== EDIT_PASSCODE) {
        alert("Incorrect passcode.");
        return;
      }
    }

    editMode = !editMode;

    document.body.classList.toggle(
      "admin-edit-mode",
      editMode
    );

    els.editModeBtn.setAttribute(
      "aria-pressed",
      String(editMode)
    );

    els.editModeBtn.textContent = editMode
      ? "Done"
      : "Edit";

    els.editorPanel.classList.toggle(
      "hidden",
      !editMode
    );

    map.getContainer().style.cursor = editMode
      ? "crosshair"
      : "grab";

    renderAll();
  }

  function placeSelected(latlng) {
    if (!editMode || !selectedId) return;
    const location = locations.find(item => item.id === selectedId);
    const config = mapConfigs[currentRegion];
    if (!location || location.region !== currentRegion) return;

    const x = Math.round(Math.min(config.width, Math.max(0, latlng.lng)));
    const y = Math.round(Math.min(config.height, Math.max(0, latlng.lat)));
    location.map[currentStyle] = { x, y };
    saveCoordinates();
    renderAll();
    selectLocation(location.id, { focus: false, scroll: true, popup: true });
  }

  function makeDataFile() {
    const plain = locations.map(
      ({
        id,
        name,
        helper,
        image,
        region,
        map
      }) => ({
        id,
        name,
        helper,
        image: image || "",
        region,
        map: {
          satellite: {
            x: map.satellite.x,
            y: map.satellite.y
          },
          atlas: {
            x: map.atlas.x,
            y: map.atlas.y
          }
        }
      })
    );

    return (
      "window.DROP_LOCATIONS = " +
      JSON.stringify(plain, null, 2) +
      ";\n"
    );
  }

  async function copyData() {
    try {
      await navigator.clipboard.writeText(makeDataFile());
      flashButton(els.copyDataBtn, "Copied!");
    } catch (error) {
      console.error(error);
      alert("Clipboard access was blocked. Use Download JS instead.");
    }
  }

  function downloadData() {
    const blob = new Blob([makeDataFile()], { type: "text/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "drop-locations.js";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    flashButton(els.downloadDataBtn, "Downloaded!");
  }

  function resetSaved() {
    if (!confirm("Clear all marker coordinates saved in this browser? This does not change your original JS file.")) return;
    localStorage.removeItem(STORAGE_KEY);
    locations.forEach((location, index) => {
      location.map = normalizeStyleCoords(sourceLocations[index]?.map);
    });
    selectedId = null;
    renderAll();
  }

  function flashButton(button, label) {
    const old = button.textContent;
    button.textContent = label;
    setTimeout(() => { button.textContent = old; }, 1300);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function openLightbox(src, alt = "") {
    if (!src) return;

    els.lightboxImage.src = src;
    els.lightboxImage.alt = alt;

    els.imageLightbox.classList.remove("hidden");
    document.body.classList.add("lightbox-open");
  }

  function closeLightbox() {
    els.imageLightbox.classList.add("hidden");

    els.lightboxImage.src = "";
    els.lightboxImage.alt = "";

    document.body.classList.remove("lightbox-open");
  }
  
  els.sanAndreasBtn.addEventListener("click", () => setRegion("san-andreas"));
  els.cayoBtn.addEventListener("click", () => setRegion("cayo"));
  els.satelliteBtn.addEventListener("click", () => setStyle("satellite"));
  els.atlasBtn.addEventListener("click", () => setStyle("atlas"));
  els.editModeBtn.addEventListener("click", toggleEditMode);
  els.showAllBtn.addEventListener("click", () => setFilter("all"));
  els.showMappedBtn.addEventListener("click", () => setFilter("mapped"));
  els.showUnmappedBtn.addEventListener("click", () => setFilter("unmapped"));
  els.copyDataBtn.addEventListener("click", copyData);
  els.downloadDataBtn.addEventListener("click", downloadData);
  els.resetLocalBtn.addEventListener("click", resetSaved);
  els.dropSearch.addEventListener("input", () => {
    els.clearSearchBtn.classList.toggle("hidden", !els.dropSearch.value);
    renderList();
  });
  els.clearSearchBtn.addEventListener("click", () => {
    els.dropSearch.value = "";
    els.clearSearchBtn.classList.add("hidden");
    els.dropSearch.focus();
    renderList();
  });
  map.on("click", event => placeSelected(event.latlng));

  document.addEventListener("click", event => {
    const image = event.target.closest?.(
      "[data-lightbox-image]"
    );

    if (!image) return;

    event.preventDefault();
    event.stopPropagation();

    openLightbox(
      image.dataset.lightboxImage,
      image.dataset.lightboxAlt || ""
    );
  });

  els.closeLightboxBtn.addEventListener("click", event => {
    event.stopPropagation();
    closeLightbox();
  });

  els.imageLightbox.addEventListener("click", event => {
    if (event.target === els.imageLightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      !els.imageLightbox.classList.contains("hidden")
    ) {
      closeLightbox();
    }
  });

  loadSavedCoordinates();
  updateOverlay(true);
  renderAll();

  const params = new URLSearchParams(location.search);
  const requested = params.get("location");
  if (requested && locations.some(item => item.id === requested)) {
    setTimeout(() => selectLocation(requested, { focus: true, scroll: true, popup: true }), 250);
  }
})();
