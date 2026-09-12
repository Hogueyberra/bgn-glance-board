
(() => {
  const POLL_MS = 5000;
  const LOCAL_KEY = "bgn-local-overlay-v1";
  const DEFAULT_MANAGERS = [
    "David", "Rich", "Jeff", "Wes", "Mike", "Kyle",
    "Ryan", "Alex", "Nick", "Sean", "Patrick", "Adam"
  ];

  function managerList() {
    const fromLive = (state.live?.room || []).map((r) => r.name).filter(Boolean);
    return fromLive.length ? fromLive : DEFAULT_MANAGERS;
  }

  function populateManagers() {
    const sel = document.getElementById("manager-select");
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Select…</option>';
    for (const name of managerList()) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name === "Nick" ? "Nick (you)" : name;
      sel.append(opt);
    }
    if (current) sel.value = current;
  }

  function populatePlayerSuggest() {
    const list = document.getElementById("player-suggest");
    if (!list || !state.board) return;
    list.innerHTML = "";
    for (const p of state.board.players || []) {
      const opt = document.createElement("option");
      opt.value = p.name;
      list.append(opt);
    }
  }

  const state = {
    board: null,
    live: null,
    local: loadLocal(),
    lastSync: null,
    syncError: null,
  };

  function loadLocal() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function saveLocal() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state.local));
  }

  function maxBid(cash, openSpots) {
    return Math.max(0, cash - (openSpots - 1));
  }

  function normalizeName(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function soldIndex() {
    const map = new Map();
    for (const s of state.live?.sold || []) {
      map.set(normalizeName(s.player), s);
    }
    for (const s of state.local.sold || []) {
      map.set(normalizeName(s.player), { ...s, local: true });
    }
    return map;
  }

  function playerMatchesSold(player, soldMap) {
    const ids = [player.name, ...(player.aliases || [])];
    for (const id of ids) {
      const hit = soldMap.get(normalizeName(id));
      if (hit) return hit;
    }
    // partial: card name contains sold name or vice versa
    const pname = normalizeName(player.name);
    for (const [k, v] of soldMap) {
      if (!k) continue;
      if (pname.includes(k) || k.includes(pname)) return v;
    }
    return null;
  }

  async function fetchJson(path) {
    const url = `${path}?t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return res.json();
  }

  async function refreshLive() {
    try {
      state.live = await fetchJson("live.json");
      state.lastSync = new Date();
      state.syncError = null;
      populateManagers();
      render();
    } catch (err) {
      state.syncError = String(err.message || err);
      renderHeaderOnly();
    }
  }

  function effectiveNick() {
    const n = state.live?.nick || { cash: 200, spent: 0, open_spots: 13, roster: [] };
    // apply local wins not yet in live
    const liveNames = new Set((n.roster || []).map((r) => normalizeName(r.player)));
    let cash = n.cash;
    let spent = n.spent;
    let open = n.open_spots;
    const roster = [...(n.roster || [])];
    for (const s of state.local.sold || []) {
      if (!s.mine) continue;
      if (liveNames.has(normalizeName(s.player))) continue;
      roster.push({ player: s.player, pos: s.pos || "", price: s.price });
      spent += Number(s.price) || 0;
      cash -= Number(s.price) || 0;
      open = Math.max(0, open - 1);
    }
    return {
      cash,
      spent,
      open_spots: open,
      max_bid: maxBid(cash, open),
      roster,
    };
  }

  function el(tag, attrs = {}, kids = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v);
    }
    for (const c of kids) node.append(c);
    return node;
  }

  function cardFor(player, soldMap) {
    const sold = playerMatchesSold(player, soldMap);
    const action = player.action || "value";
    const card = el("div", {
      className: `card ${action}${sold ? " sold" : ""}${sold?.mine || sold?.winner === "nick" ? " mine" : ""}`,
      "data-id": player.id,
    });
    const left = el("div", {}, [
      el("div", { className: "name", text: player.name }),
      el("div", { className: "meta", text: player.pos || "" }),
      el("span", { className: `tag ${action}`, text: action.toUpperCase() }),
    ]);
    const price = el("div", { className: "price" }, [
      document.createTextNode("$" + (player.fight_to || "—")),
    ]);
    price.append(el("small", { text: "fight-to" }));
    card.append(left, price);
    if (player.note) card.append(el("div", { className: "note", text: player.note }));
    if (sold) {
      const mine = sold.mine || sold.winner === "nick" || sold.manager === "Nick";
      const mgr = sold.manager || (mine ? "Nick" : sold.winner) || "room";
      card.append(
        el("div", {
          className: `sold-badge${mine ? " mine" : ""}`,
          text: mine
            ? `NICK @ $${sold.price}${sold.local ? " (local)" : ""}`
            : `SOLD $${sold.price} → ${mgr}${sold.local ? " (local)" : ""}`,
        })
      );
    }
    const actions = el("div", { className: "card-actions" });
    const wonBtn = el("button", {
      className: "primary",
      text: "I won",
      disabled: !!sold,
      onClick: () => promptSale(player, true),
    });
    const soldBtn = el("button", {
      text: "Sold → mgr",
      disabled: !!sold,
      onClick: () => promptSale(player, false),
    });
    actions.append(wonBtn, soldBtn);
    card.append(actions);
    return card;
  }

  function promptSale(player, mine) {
    const raw = prompt(`${mine ? "Your" : "Sale"} price for ${player.name}?`, "");
    if (raw == null || raw.trim() === "") return;
    const price = Number(String(raw).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(price) || price < 0) {
      alert("Enter a number");
      return;
    }
    let manager = "Nick";
    if (!mine) {
      const names = managerList().filter((n) => n !== "Nick");
      const picked = prompt(`Manager who won ${player.name}?\n${names.join(", ")}`, names[0] || "");
      if (picked == null || !picked.trim()) return;
      manager = picked.trim();
      const match = managerList().find((n) => n.toLowerCase() === manager.toLowerCase());
      if (match) manager = match;
    }
    state.local.sold = state.local.sold || [];
    state.local.sold.push({
      player: player.name,
      pos: player.pos,
      price,
      mine: manager === "Nick",
      winner: manager === "Nick" ? "nick" : manager,
      manager,
      at: new Date().toISOString(),
    });
    saveLocal();
    render();
  }

  function renderHeaderOnly() {
    const msg = document.getElementById("live-msg");
    if (!msg) return;
    msg.className = "live-msg error";
    msg.textContent = `Live sync error: ${state.syncError}. Board still usable offline/local.`;
  }

  function render() {
    if (!state.board) return;
    const nick = effectiveNick();
    const soldMap = soldIndex();

    document.getElementById("cash").textContent = `$${nick.cash}`;
    document.getElementById("maxbid").textContent = `$${nick.max_bid}`;
    document.getElementById("open").textContent = String(nick.open_spots);
    document.getElementById("spent").textContent = `$${nick.spent}`;

    const msg = document.getElementById("live-msg");
    const sync = state.lastSync ? state.lastSync.toLocaleTimeString() : "—";
    if (state.syncError) {
      msg.className = "live-msg error";
      msg.textContent = `Sync error: ${state.syncError}`;
    } else {
      msg.className = "live-msg";
      msg.innerHTML = `${state.live?.message || ""} <span class="sync">· synced ${sync}</span>`;
    }

    for (const section of ["qb", "rb", "wr", "darts", "soak"]) {
      const host = document.getElementById(`grid-${section}`);
      if (!host) continue;
      host.innerHTML = "";
      const players = state.board.players.filter((p) => p.section === section);
      for (const p of players) host.append(cardFor(p, soldMap));
    }

    // roster
    const rosterBody = document.getElementById("roster-body");
    rosterBody.innerHTML = "";
    for (const r of nick.roster) {
      const tr = el("tr", {}, [
        el("td", { text: r.player }),
        el("td", { text: r.pos || "" }),
        el("td", { text: "$" + r.price }),
      ]);
      rosterBody.append(tr);
    }
    if (!nick.roster.length) {
      rosterBody.append(el("tr", {}, [el("td", { colspan: "3", text: "No players yet" })]));
    }

    // sales log
    const salesBody = document.getElementById("sales-body");
    salesBody.innerHTML = "";
    const sales = [...(state.live?.sold || []), ...(state.local.sold || [])];
    sales
      .slice()
      .reverse()
      .forEach((s, i) => {
        salesBody.append(
          el("tr", {}, [
            el("td", { text: s.player }),
            el("td", { text: "$" + s.price }),
            el("td", { text: s.manager || (s.mine || s.winner === "nick" ? "Nick" : s.winner) || "room" }),
          ])
        );
      });
    if (!sales.length) {
      salesBody.append(el("tr", {}, [el("td", { colspan: "3", text: "No sales yet" })]));
    }

    // tips
    const tips = document.getElementById("tips");
    tips.innerHTML = "";
    for (const t of state.live?.tips || []) {
      tips.append(el("li", { text: t }));
    }
    if (!(state.live?.tips || []).length) tips.append(el("li", { text: "No live tips yet — Ball fills these after sales." }));

    // alpha
    const alpha = document.getElementById("alpha");
    alpha.innerHTML = "";
    const sorted = [...state.board.players].sort((a, b) => a.name.localeCompare(b.name));
    for (const p of sorted) {
      const sold = playerMatchesSold(p, soldMap);
      alpha.append(
        el("div", { className: sold ? "gone" : "" }, [
          document.createTextNode(`${p.name} — `),
          el("b", { text: `${(p.action || "").toUpperCase()} $${p.fight_to}` }),
        ])
      );
    }
  }

  function clearLocal() {
    if (!confirm("Clear local overlay sales on this laptop?")) return;
    state.local = {};
    saveLocal();
    render();
  }

  async function init() {
    document.getElementById("clear-local").addEventListener("click", clearLocal);
    document.getElementById("manual-sale").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const player = String(fd.get("player") || "").trim();
      const price = Number(fd.get("price"));
      const manager = String(fd.get("manager") || "").trim();
      if (!player || !Number.isFinite(price) || !manager) return;
      const mine = manager === "Nick";
      state.local.sold = state.local.sold || [];
      state.local.sold.push({
        player,
        price,
        mine,
        winner: mine ? "nick" : manager,
        manager,
        at: new Date().toISOString(),
      });
      saveLocal();
      e.target.reset();
      populateManagers();
      render();
    });

    state.board = await fetchJson("data/board.json");
    populatePlayerSuggest();
    populateManagers();
    document.getElementById("plan-text").textContent = state.board.plan || "";
    const script = document.getElementById("script-list");
    script.innerHTML = "";
    for (const step of state.board.script || []) script.append(el("li", { text: step }));

    await refreshLive();
    setInterval(refreshLive, POLL_MS);
  }

  init().catch((err) => {
    document.getElementById("live-msg").className = "live-msg error";
    document.getElementById("live-msg").textContent = "Failed to load board: " + err;
  });
})();
