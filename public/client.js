(async function () {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");

  // modal shell (we reuse the newBoard modal DOM)
  const newModal = document.getElementById("newModal");
  const newTimerText = document.getElementById("newTimerText");
  const confirmNew = document.getElementById("confirmNew");
  const cancelNew = document.getElementById("cancelNew");

  // preference modal elements
  const prefModal = document.getElementById("prefModal");
  const yesPref = document.getElementById("yesPref");
  const noPref = document.getElementById("noPref");

  let currentBoard = null;
  let pendingCell = null;

  // flag preventing repeated Bingo popups for the same board
  let bingoShown = false;

  // Generic modal helper that reuses newModal markup
  function showModal(title, message, buttons) {
    newModal.querySelector("h3").textContent = title;
    newModal.querySelector("p").textContent = message;
    // hide the default newBoard timer + default buttons
    newTimerText.style.display = "none";
    confirmNew.style.display = "none";
    cancelNew.style.display = "none";

    // remove any previous temporary buttons
    newModal.querySelectorAll(".tempBtn").forEach((b) => b.remove());

    buttons.forEach(({ label, handler, secondary }) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.className = secondary ? "secondary tempBtn" : "tempBtn";
      btn.addEventListener("click", () => {
        newModal.classList.remove("active");
        handler();
      });
      newModal.querySelector(".modal-box").appendChild(btn);
    });

    newModal.classList.add("active");
  }

  // API helper includes token header
  const api = async (path, opts = {}) => {
    const token =
      localStorage.getItem("bingo_token") ||
      (() => {
        const t = crypto.randomUUID();
        localStorage.setItem("bingo_token", t);
        return t;
      })();

    const res = await fetch(path, {
      headers: { "Content-Type": "application/json", "x-bingo-token": token },
      credentials: "same-origin",
      ...opts,
    });
    return res.json();
  };

  // Render board DOM (do NOT reset bingoShown here)
  const renderBoard = (board) => {
    currentBoard = board;
    boardEl.innerHTML = "";

    board.forEach((row, r) =>
      row.forEach((cell, c) => {
        const div = document.createElement("div");
        div.className = "cell";
        if (cell.clicked) div.classList.add("clicked");
        if (cell.fixed) div.classList.add("fixed");
        div.dataset.r = r;
        div.dataset.c = c;
        div.innerHTML =
          cell.clicked && cell.image
            ? `<img src="${cell.image}" alt="${cell.text}">`
            : cell.text;

        // Only show confirm on non-fixed cells
        if (!cell.fixed) {
          div.addEventListener("click", () => {
            pendingCell = { r, c };
            showModal("Mark this square?", "Are you sure you want to select this square?", [
              { label: "OK", handler: confirmClick },
              { label: "Cancel", handler: () => (pendingCell = null), secondary: true },
            ]);
          });
        }

        boardEl.appendChild(div);
      })
    );

    // restart cell animations (nice visual)
    boardEl.querySelectorAll(".cell").forEach((el) => {
      el.style.animation = "none";
      // force reflow
      // eslint-disable-next-line no-unused-expressions
      el.offsetHeight;
      el.style.animation = "";
    });
  };

  // treat FREE as filled
  const isClicked = (sq) => sq.clicked || sq.fixed;

  // check rows and columns for bingo
  const checkBingo = (board) => {
    const size = board.length;
    for (let r = 0; r < size; r++) if (board[r].every(isClicked)) return true;
    for (let c = 0; c < size; c++) if (board.every((row) => isClicked(row[c]))) return true;
    return false;
  };

  // invoked when user confirms marking a cell
  async function confirmClick() {
    if (!pendingCell) return;
    const { r, c } = pendingCell;
    pendingCell = null;

    const res = await api("/api/click", {
      method: "POST",
      body: JSON.stringify({ row: r, col: c }),
    });

    renderBoard(res.board);

    // only show bingo once per board
    if (!bingoShown && checkBingo(res.board)) {
      bingoShown = true;
      showModal("🎉 Bingo!", "You completed a row or column!", [{ label: "OK", handler: () => {} }]);
    }

    if (res.completed) {
      statusEl.textContent = "🎉 Bingo complete! Show your screen at the booth!";
    }
  }

  // Preference modal handlers
  yesPref.addEventListener("click", async () => {
    await api("/api/preference", { method: "POST", body: JSON.stringify({ preference: true }) });
    prefModal.classList.remove("active");
    sessionStorage.setItem("askedPref", "1");
  });
  noPref.addEventListener("click", async () => {
    await api("/api/preference", { method: "POST", body: JSON.stringify({ preference: false }) });
    prefModal.classList.remove("active");
    sessionStorage.setItem("askedPref", "1");
  });

  // New board button (keeps original behaviour and resets bingoShown)
  document.getElementById("newBoard").addEventListener("click", () => {
    newModal.querySelector("h3").textContent = "Start a new board?";
    newModal.querySelector("p").textContent =
      "If you generate a new board now, you won’t receive a prize for the current one.";
    newTimerText.style.display = "";
    confirmNew.style.display = "";
    cancelNew.style.display = "";
    newModal.classList.add("active");

    confirmNew.disabled = true;
    let countdown = 3;
    newTimerText.textContent = `You can confirm in ${countdown}...`;
    const timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(timer);
        confirmNew.disabled = false;
        newTimerText.textContent = "You may now confirm.";
      } else {
        newTimerText.textContent = `You can confirm in ${countdown}...`;
      }
    }, 1000);
  });

  cancelNew.addEventListener("click", () => newModal.classList.remove("active"));

  confirmNew.addEventListener("click", async () => {
    const res = await api("/api/newboard", { method: "POST" });
    if (res.ok) {
      bingoShown = false; // reset only when user explicitly creates a new board
      renderBoard(res.board);
      statusEl.textContent = "New board generated. Prize eligibility reset.";
    }
    newModal.classList.remove("active");
  });

  // reload and screenshot buttons
  document.getElementById("reset").addEventListener("click", async () => {
    const { board } = await api("/api/board");
    bingoShown = false; // reset when reloading board from server (start fresh)
    renderBoard(board);
  });

  document.getElementById("screenshot").addEventListener("click", () => {
    import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.esm.js")
      .then(({ toPng }) => toPng(boardEl))
      .then((dataUrl) => {
        const link = document.createElement("a");
        link.download = "bingo.png";
        link.href = dataUrl;
        link.click();
      })
      .catch(() => alert("Screenshot failed — ensure images are same-origin."));
  });

  // initial load: bingoShown starts false
  const { board, meta } = await api("/api/board");
  bingoShown = false;
  renderBoard(board);
  if (meta && !sessionStorage.getItem("askedPref")) prefModal.classList.add("active");
})();
