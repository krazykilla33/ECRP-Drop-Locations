(() => {
  "use strict";

  const STORAGE_KEY = "ecrp-drop-location-coordinates-v1";
  const sourceLocations = Array.isArray(window.DROP_LOCATIONS) ? window.DROP_LOCATIONS : [];
  const locations = sourceLocations.map(item => ({
    ...item,
    helper: item.helper || "",
    map: { x: item.map?.x ?? null, y: item.map?.y ?? null }
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
    resetLocalBtn: document.getElementById("resetLocalBtn")
  };

  function isMapped(location) {
    return Number.isFinite(location.map?.x) && Number.isFinite(location.map?.y);
  }

  function loadSavedCoordinates() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      locations.forEach(location => {
        const coords = saved[location.id];
        if (coords && Number.isFinite(coords.x) && Number.isFinite(coords.y)) {
          location.map.x = coords.x;
          location.map.y = coords.y;
        }
      });
    } catch (error) {
      console.warn("Could not load saved drop-location coordinates.", error);
    }
  }

  function saveCoordinates() {
    const output = {};
    locations.forEach(location => {
      if (isMapped(location)) output[location.id] = { x: location.map.x, y: location.map.y };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(output));
  }

  function getRegionLocations() {
    return locations.filter(location => location.region === currentRegion);
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
    return L.divIcon({
      className: "drop-marker-wrap",
      html: `<div class="drop-marker${selected ? " selected" : ""}"></div>`,
      iconSize: [28, 32],
      iconAnchor: [13, 30],
      popupAnchor: [1, -28]
    });
  }

  function popupHtml(location) {
    return `
      <div class="popup-name">${escapeHtml(location.name)}</div>
      ${location.helper ? `<div class="popup-helper">${escapeHtml(location.helper)}</div>` : ""}
      ${editMode ? `<div class="popup-coords">X: ${location.map.x} &nbsp; Y: ${location.map.y}</div>` : ""}
    `;
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    markerMap.clear();

    getRegionLocations().forEach(location => {
      if (!isMapped(location)) return;
      const marker = L.marker([location.map.y, location.map.x], {
        icon: markerIcon(location.id === selectedId),
        keyboard: true,
        title: location.name
      }).addTo(markerLayer);

      marker.bindPopup(popupHtml(location), { closeButton: true, autoPanPadding: [40, 80] });
      marker.on("click", () => selectLocation(location.id, { focus: false, scroll: true, popup: true }));
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
        <span>
          <span class="location-name">${escapeHtml(location.name)}</span>
          ${location.helper ? `<span class="location-helper">${escapeHtml(location.helper)}</span>` : ""}
        </span>
        <span class="location-state">${mapped ? "MAPPED" : "UNMAPPED"}</span>
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
      map.flyTo([location.map.y, location.map.x], targetZoom, { duration: 0.65 });
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
      ? `Click the map to ${isMapped(location) ? "move" : "place"} “${location.name}”.`
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
  }

  function updateOverlay(fit) {
    const config = mapConfigs[currentRegion];
    const center = map.getCenter();
    const zoom = map.getZoom();
    if (imageOverlay) map.removeLayer(imageOverlay);

    mapBounds = [[0, 0], [config.height, config.width]];
    imageOverlay = L.imageOverlay(config[currentStyle], mapBounds, { interactive: false }).addTo(map);
    imageOverlay.bringToBack();
    map.setMaxBounds([[-config.height * .2, -config.width * .2], [config.height * 1.2, config.width * 1.2]]);

    if (fit || !Number.isFinite(zoom)) map.fitBounds(mapBounds, { animate: false });
    else map.setView(center, zoom, { animate: false });
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
    editMode = !editMode;
    els.editModeBtn.setAttribute("aria-pressed", String(editMode));
    els.editModeBtn.textContent = editMode ? "Done" : "Edit";
    els.editorPanel.classList.toggle("hidden", !editMode);
    map.getContainer().style.cursor = editMode ? "crosshair" : "grab";
    renderAll();
  }

  function placeSelected(latlng) {
    if (!editMode || !selectedId) return;
    const location = locations.find(item => item.id === selectedId);
    const config = mapConfigs[currentRegion];
    if (!location || location.region !== currentRegion) return;

    const x = Math.round(Math.min(config.width, Math.max(0, latlng.lng)));
    const y = Math.round(Math.min(config.height, Math.max(0, latlng.lat)));
    location.map.x = x;
    location.map.y = y;
    saveCoordinates();
    renderAll();
    selectLocation(location.id, { focus: false, scroll: true, popup: true });
  }

  function makeDataFile() {
    const plain = locations.map(({ id, name, helper, region, map: coords }) => ({ id, name, helper, region, map: coords }));
    return `window.DROP_LOCATIONS = ${JSON.stringify(plain, null, 2)};\n`;
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
      location.map.x = sourceLocations[index]?.map?.x ?? null;
      location.map.y = sourceLocations[index]?.map?.y ?? null;
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

  loadSavedCoordinates();
  updateOverlay(true);
  renderAll();

  const params = new URLSearchParams(location.search);
  const requested = params.get("location");
  if (requested && locations.some(item => item.id === requested)) {
    setTimeout(() => selectLocation(requested, { focus: true, scroll: true, popup: true }), 250);
  }
})();
