export function createLayout({ dom, state, storage, storageKeys }) {
  const dropIndicator = document.createElement("div");
  dropIndicator.className = "drop-indicator";
  dropIndicator.setAttribute("aria-hidden", "true");
  dom.dashboardEl.style.position = "relative";
  dom.dashboardEl.appendChild(dropIndicator);

  let drag = null;
  let rafId = null;
  let lastHintedBlock = null;

  function escapeId(id) {
    return CSS.escape ? CSS.escape(id) : id;
  }

  function capturePositions(blocks) {
    const map = new Map();
    blocks.forEach((b) => map.set(b.dataset.blockId, b.getBoundingClientRect()));
    return map;
  }

  function animateBlocks(oldPos, blocks) {
    blocks.forEach((block) => {
      const id = block.dataset.blockId;
      const prev = oldPos.get(id);
      if (!prev) return;
      const cur = block.getBoundingClientRect();
      const dx = prev.left - cur.left;
      const dy = prev.top - cur.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      block.style.transform = `translate(${dx}px, ${dy}px)`;
      block.style.transition = "none";
      requestAnimationFrame(() => {
        block.style.transition = "transform 0.25s cubic-bezier(0.2, 0, 0, 1)";
        block.style.transform = "";
        function cleanup() {
          block.style.transition = "";
          block.style.transform = "";
          block.removeEventListener("transitionend", cleanup);
        }
        block.addEventListener("transitionend", cleanup, { once: true });
      });
    });
  }

  return {
    getBlocks() {
      return Array.from(dom.dashboardEl.querySelectorAll("[data-block-id]"));
    },
    saveOrder() {
      storage.writeJson(
        storageKeys.dashboardOrder,
        this.getBlocks().map((block) => block.dataset.blockId)
      );
    },
    applyOrder(order) {
      const currentBlocks = this.getBlocks();
      const blockMap = new Map(currentBlocks.map((block) => [block.dataset.blockId, block]));
      order.forEach((blockId) => {
        const block = blockMap.get(blockId);
        if (block) dom.dashboardEl.appendChild(block);
      });
      currentBlocks.forEach((block) => {
        if (!order.includes(block.dataset.blockId)) {
          dom.dashboardEl.appendChild(block);
        }
      });
    },
    flash(block) {
      block.classList.remove("layout-flash");
      void block.offsetWidth;
      block.classList.add("layout-flash");
    },
    clearDropHints() {
      if (lastHintedBlock) {
        lastHintedBlock.classList.remove("drop-before", "drop-after");
        lastHintedBlock = null;
      }
      dropIndicator.classList.remove("visible");
    },
    showIndicator(targetBlock, position) {
      const dashRect = dom.dashboardEl.getBoundingClientRect();
      const blockRect = targetBlock.getBoundingClientRect();
      const scrollTop = dom.dashboardEl.scrollTop || 0;
      const scrollLeft = dom.dashboardEl.scrollLeft || 0;

      const left = blockRect.left - dashRect.left + scrollLeft;
      const width = blockRect.width;
      const top =
        position === "before"
          ? blockRect.top - dashRect.top + scrollTop - 2
          : blockRect.bottom - dashRect.top + scrollTop - 2;

      dropIndicator.style.transform = `translate(${left}px, ${top}px) scaleX(1)`;
      dropIndicator.style.width = `${width}px`;
      dropIndicator.classList.add("visible");
    },
    onDragStart(event) {
      if (event.target.closest("button, input, select, textarea, a")) {
        event.preventDefault();
        return;
      }

      const block = event.currentTarget.closest("[data-block-id]");
      if (!block) {
        event.preventDefault();
        return;
      }

      drag = {
        draggedId: block.dataset.blockId,
        dropTargetId: null,
        dropPosition: null,
      };

      block.classList.add("is-dragging");
      dom.dashboardEl.classList.add("is-reordering");

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", drag.draggedId);

      try {
        const ghost = block.cloneNode(true);
        ghost.style.width = `${block.offsetWidth}px`;
        ghost.style.opacity = "0.85";
        ghost.style.position = "absolute";
        ghost.style.top = "-9999px";
        ghost.classList.add("drag-ghost");
        document.body.appendChild(ghost);
        event.dataTransfer.setDragImage(ghost, block.offsetWidth / 2, 24);
        requestAnimationFrame(() => document.body.removeChild(ghost));
      } catch (_) {
        // fallback to browser default drag image
      }
    },
    onDragOver(event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (!drag) return;

      const targetBlock = event.currentTarget;
      const clientY = event.clientY;

      if (targetBlock.dataset.blockId === drag.draggedId) {
        this.clearDropHints();
        drag.dropTargetId = null;
        drag.dropPosition = null;
        return;
      }

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!drag) return;

        const rect = targetBlock.getBoundingClientRect();
        const position = clientY < rect.top + rect.height / 2 ? "before" : "after";

        if (drag.dropTargetId === targetBlock.dataset.blockId && drag.dropPosition === position) return;

        drag.dropTargetId = targetBlock.dataset.blockId;
        drag.dropPosition = position;

        this.clearDropHints();
        targetBlock.classList.add(position === "before" ? "drop-before" : "drop-after");
        lastHintedBlock = targetBlock;
        this.showIndicator(targetBlock, position);
      });
    },
    onDrop(event) {
      event.preventDefault();
    },
    onDragEnd() {
      const draggedEl = drag
        ? dom.dashboardEl.querySelector(`[data-block-id="${escapeId(drag.draggedId)}"]`)
        : null;

      if (draggedEl) draggedEl.classList.remove("is-dragging");
      dom.dashboardEl.classList.remove("is-reordering");
      this.clearDropHints();

      if (drag && drag.dropTargetId) {
        const blocks = this.getBlocks();
        const oldPos = capturePositions(blocks);

        const draggedBlock = dom.dashboardEl.querySelector(
          `[data-block-id="${escapeId(drag.draggedId)}"]`
        );
        const targetBlock = dom.dashboardEl.querySelector(
          `[data-block-id="${escapeId(drag.dropTargetId)}"]`
        );

        if (draggedBlock && targetBlock && draggedBlock !== targetBlock) {
          if (drag.dropPosition === "before") {
            dom.dashboardEl.insertBefore(draggedBlock, targetBlock);
          } else {
            dom.dashboardEl.insertBefore(draggedBlock, targetBlock.nextSibling);
          }
          animateBlocks(oldPos, this.getBlocks());
        }
        this.saveOrder();
      }

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      drag = null;
    },
    moveByOffset(blockId, offset) {
      const blocks = this.getBlocks();
      const currentIndex = blocks.findIndex((block) => block.dataset.blockId === blockId);
      const targetIndex = currentIndex + offset;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= blocks.length) return;

      const oldPos = capturePositions(blocks);
      const currentBlock = blocks[currentIndex];
      const targetBlock = blocks[targetIndex];
      dom.dashboardEl.insertBefore(currentBlock, offset < 0 ? targetBlock : targetBlock.nextElementSibling);
      this.saveOrder();
      animateBlocks(oldPos, this.getBlocks());
      currentBlock.querySelector(".panel-head")?.focus();
    },
    reset() {
      const oldPos = capturePositions(this.getBlocks());
      storage.remove(storageKeys.dashboardOrder);
      this.applyOrder(state.layout.defaultOrder);
      animateBlocks(oldPos, this.getBlocks());
    },
    init() {
      const savedOrder = storage.readJson(storageKeys.dashboardOrder, []);
      if (Array.isArray(savedOrder) && savedOrder.length > 0) {
        this.applyOrder(savedOrder);
      }

      this.getBlocks().forEach((block) => {
        block.addEventListener("dragover", (event) => this.onDragOver(event));
        block.addEventListener("drop", (event) => this.onDrop(event));
      });

      dom.panelHeads.forEach((head) => {
        head.tabIndex = 0;
        head.setAttribute("role", "button");
        head.setAttribute("aria-label", "Drag to reposition panel. Use arrow keys to reorder.");
        head.draggable = true;
        head.addEventListener("dragstart", (event) => this.onDragStart(event));
        head.addEventListener("dragend", (event) => this.onDragEnd(event));
        head.addEventListener("keydown", (event) => {
          const block = event.currentTarget.closest("[data-block-id]");
          if (!block) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            this.moveByOffset(block.dataset.blockId, -1);
          }
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            this.moveByOffset(block.dataset.blockId, 1);
          }
        });
      });
    },
  };
}