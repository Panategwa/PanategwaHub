let toastQueue = [];
let toastActive = false;

function ensureToastStyle() {
  const styleId = "achievement-toast-style";
  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    #achievement-toast-stack {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 99999;
      display: grid;
      gap: 10px;
      width: min(360px, calc(100vw - 32px));
    }

    .achievement-toast {
      cursor: pointer;
      border-radius: 16px;
      padding: 14px 16px;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04)),
        rgba(15, 23, 42, 0.9);
      color: #fff;
      border: 1px solid rgba(148, 163, 184, 0.28);
      box-shadow: 0 18px 38px rgba(2, 6, 23, 0.35);
      backdrop-filter: blur(18px);
      display: grid;
      gap: 6px;
    }

    .achievement-toast-title {
      font-weight: 700;
    }

    .achievement-toast-desc {
      font-size: 0.92rem;
      opacity: 0.86;
      line-height: 1.35;
    }
  `;
  document.head.appendChild(style);
}

function getStack() {
  let stack = document.getElementById("achievement-toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "achievement-toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

export function ensurePanategwaToast() {
  if (typeof document === "undefined") return null;
  if (window.PanategwaToast) return window.PanategwaToast;

  ensureToastStyle();

  window.PanategwaToast = ({ title = "Message", body = "", href = "" } = {}) => {
    toastQueue.push({ title, body, href });
    if (toastActive) return;
    toastActive = true;

    const next = () => {
      const item = toastQueue.shift();
      if (!item) {
        toastActive = false;
        return;
      }

      const toast = document.createElement("div");
      toast.className = "achievement-toast";
      toast.innerHTML = `
        <div class="achievement-toast-title">${item.title}</div>
        <div class="achievement-toast-desc">${item.body}</div>
      `;
      toast.addEventListener("click", () => {
        if (item.href) window.location.href = item.href;
      });

      getStack().appendChild(toast);

      setTimeout(() => {
        toast.remove();
        next();
      }, 4200);
    };

    next();
  };

  return window.PanategwaToast;
}
