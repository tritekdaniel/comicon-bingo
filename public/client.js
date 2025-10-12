(async function () {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");

  // Modals
  const newModal = document.getElementById("newModal");
  const newTimerText = document.getElementById("newTimerText");
  const confirmNew = document.getElementById("confirmNew");
  const cancelNew = document.getElementById("cancelNew");

  const prefModal = document.getElementById("prefModal");
  const yesPref = document.getElementById("yesPref");
  const noPref = document.getElementById("noPref");

  let currentBoard = null;
  let pendingCell = null;
  let bingoShown = false; // ✅ prevents multiple Bingo pop-ups

  // --- Generic modal reuse helper ---
  function showModal(title, message, buttons) {
    newModal.querySelector("h3").textContent = title;
    newModal.querySelector("p").textContent = message;
    newTimerText.style.display = "none";
    confirmNew.style.display = "none";
    cancelNew.style.display = "none";

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

  // --- API helper ---
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

  // --- Render board ---
  const renderBoard = (board) => {
    currentBoard = board;
    bingoShown = false; // ✅ reset Bingo flag for new board
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

        // ✅ Only clickable if not fixed
        if (!cell.fixed) {
          div.addEventListener("click", () => {
            pendingCell = { r, c };
            showModal(
              "Mark this square?",
              "Are you sure you want to select this square?",
              [
                { label: "OK", handler: confirmClick },
                {
                  label: "Cancel",
                  handler: () => (pendingCell = null),
                  secondary: true,
                },
              ]
            );
          });
        }

        boardEl.appendChild(div);
      })
    );
  };

  // --- Check for completed rows/columns only ---
  const isClicked = (sq) => sq.clicked || sq.fixed;
  const checkBingo = (board) => {
    const size = board.length;
    for (let r = 0; r < size; r++) if (board[r].every(isClicked)) return true;
    for (let c = 0; c < size; c++)
      if (board.every((row) => isClicked(row[c]))) return true;
    return false;
  };

  // --- Confirm & mark a cell ---
  async function confirmClick() {
    if (!pendingCell) return;
    const { r, c } = pendingCell;
    pendingCell = null;

    const res = await api("/api/click", {
      method: "POST",
      body: JSON.stringify({ row: r, col: c }),
    });

    renderBoard(res.board);

    // ✅ only trigger Bingo once per board
    if (!bingoShown && checkBingo(res.board)) {
      bingoShown = true;
      showModal("🎉 Bingo!", "You completed a row or column!", [
        { label: "OK", handler: () => {} },
      ]);
    }
  }

  // --- Preference modal ---
  yesPref.addEventListener("click", async () => {
    await api("/api/preference", {
      method: "POST",
      body: JSON.stringify({ preference: true }),
    });
    prefModal.classList.remove("active");
    sessionStorage.setItem("askedPref", "1");
  });
  noPref.addEventListener("click", async () => {
    await api("/api/preference", {
      method: "POST",
      body: JSON.stringify({ preference: false }),
    });
    prefModal.classList.remove("active");
    sessionStorage.setItem("askedPref", "1");
  });

  // --- “New Board” modal logic ---
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

  cancelNew.addEventListener("click", () =>
    newModal.classList.remove("active")
  );

  confirmNew.addEventListener("click", async () => {
    const res = await api("/api/newboard", { method: "POST" });
    if (res.ok) renderBoard(res.board);
    newModal.classList.remove("active");
  });

  // --- Buttons ---
  document.getElementById("reset").addEventListener("click", async () => {
    const { board } = await api("/api/board");
    renderBoard(board);
  });

  document.getElementById("screenshot").addEventListener("click", () => {
    import(
      "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.esm.js"
    )
      .then(({ toPng }) => toPng(boardEl))
      .then((dataUrl) => {
        const link = document.createElement("a");
        link.download = "bingo.png";
        link.href = dataUrl;
        link.click();
      })
      .catch(() =>
        alert("Screenshot failed — ensure images are local and same-origin.")
      );
  });

  // --- Initial load ---
  const { board, meta } = await api("/api/board");
  renderBoard(board);
  if (meta && !sessionStorage.getItem("askedPref"))
    prefModal.classList.add("active");
})();
