package com.mokomail.browser;

import java.util.List;

/** Домашняя страница новой вкладки — в цветах Material You. */
public final class HomePage {

    /** Цветовые роли Material 3, полученные из темы приложения. */
    public static class Colors {
        public String primary = "#4A5BC4";
        public String onPrimary = "#FFFFFF";
        public String primaryContainer = "#DEE0FF";
        public String onPrimaryContainer = "#00105C";
        public String surface = "#FBF8FF";
        public String surfaceContainer = "#EFEDF4";
        public String surfaceContainerHigh = "#E9E7EF";
        public String onSurface = "#1B1B21";
        public String onSurfaceVariant = "#46464F";
        public String outlineVariant = "#C6C6D0";
    }

    public static String html(List<Store.Item> top, String engineName) {
        return html(top, engineName, new Colors());
    }

    public static String html(List<Store.Item> top, String engineName, Colors c) {
        return html(top, engineName, c, true);
    }

    public static String html(List<Store.Item> top, String engineName, Colors c, boolean showTop) {
        StringBuilder links = new StringBuilder();
        if (top != null) {
            for (Store.Item it : top) {
                String host = Store.hostOf(it.url);
                if (host == null) continue;
                String title = (it.title == null || it.title.isEmpty()) ? host : it.title;
                String letter = title.substring(0, 1).toUpperCase();
                String favicon = "https://www.google.com/s2/favicons?sz=64&domain=" + host;
                links.append("<a class=\"ql\" href=\"").append(esc(it.url)).append("\">")
                     .append("<span class=\"ql-ic\"><img src=\"").append(esc(favicon))
                     .append("\" alt=\"\" onerror=\"this.remove();this.parentNode.textContent='")
                     .append(js(letter)).append("'\"></span>")
                     .append("<span class=\"ql-t\">").append(esc(title)).append("</span>")
                     .append("</a>");
            }
        }

        String name = engineName == null || engineName.isEmpty() ? "MokomailBrowser" : engineName;
        String placeholder = "Поиск в " + name + " или адрес сайта";

        StringBuilder b = new StringBuilder();
        b.append("<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\">")
         .append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">")
         .append("<title>MokomailBrowser</title><style>")
         .append(":root{")
         .append("--primary:").append(c.primary).append(";")
         .append("--on-primary:").append(c.onPrimary).append(";")
         .append("--primary-container:").append(c.primaryContainer).append(";")
         .append("--on-primary-container:").append(c.onPrimaryContainer).append(";")
         .append("--surface:").append(c.surface).append(";")
         .append("--surface-container:").append(c.surfaceContainer).append(";")
         .append("--surface-container-high:").append(c.surfaceContainerHigh).append(";")
         .append("--on-surface:").append(c.onSurface).append(";")
         .append("--on-surface-variant:").append(c.onSurfaceVariant).append(";")
         .append("--outline-variant:").append(c.outlineVariant).append(";")
         .append("}")
         .append("*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}")
         .append("html,body{margin:0;padding:0}")
         .append("body{background:var(--surface);color:var(--on-surface);")
         .append("font-family:'Roboto',-apple-system,'Segoe UI',system-ui,sans-serif;")
         .append("min-height:100vh;display:flex;align-items:flex-start;justify-content:center;")
         .append("padding:max(34px,env(safe-area-inset-top)) 20px 32px}")
         .append(".wrap{width:100%;max-width:680px;display:flex;flex-direction:column;gap:26px}")
         .append(".brand{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:8px}")
         .append(".brand h1{font-size:22px;font-weight:600;margin:0;letter-spacing:.2px}")
         .append(".brand svg{display:block;filter:drop-shadow(0 6px 14px rgba(63,92,208,.35))}")
         .append(".search{display:flex;align-items:center;gap:12px;background:var(--surface-container-high);")
         .append("border:1px solid var(--outline-variant);border-radius:28px;padding:15px 20px;")
         .append("transition:border-color .18s,background .18s,box-shadow .18s}")
         .append(".search:focus-within{border-color:var(--primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 22%,transparent)}")
         .append(".search svg{flex:0 0 auto;opacity:.75}")
         .append(".search input{flex:1;min-width:0;background:transparent;border:0;outline:0;")
         .append("color:var(--on-surface);font-size:16px;font-family:inherit}")
         .append(".search input::placeholder{color:var(--on-surface-variant)}")
         .append(".sec{display:flex;flex-direction:column;gap:12px}")
         .append(".sec-title{font-size:13px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;")
         .append("color:var(--on-surface-variant);margin:0 2px}")
         .append(".qls{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:6px}")
         .append(".ql{display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 6px;")
         .append("border-radius:20px;text-decoration:none;color:var(--on-surface);")
         .append("transition:background .16s;overflow:hidden}")
         .append(".ql:active,.ql:hover{background:var(--surface-container)}")
         .append(".ql-ic{width:44px;height:44px;border-radius:22px;background:var(--surface-container-high);")
         .append("display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;")
         .append("color:var(--on-primary-container);background:var(--primary-container);overflow:hidden}")
         .append(".ql-ic img{width:26px;height:26px;border-radius:6px}")
         .append(".ql-t{font-size:12.5px;max-width:100%;text-align:center;white-space:nowrap;")
         .append("overflow:hidden;text-overflow:ellipsis;width:100%}")
         .append(".empty{color:var(--on-surface-variant);font-size:14px;text-align:center;")
         .append("background:var(--surface-container);border-radius:20px;padding:22px}")
         .append(".foot{margin-top:6px;text-align:center;color:var(--on-surface-variant);font-size:12px;opacity:.85}")
         .append(".chip{display:inline-flex;align-items:center;gap:6px;background:var(--primary-container);")
         .append("color:var(--on-primary-container);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:500}")
         .append(".chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:2px}")
         .append("button.chip{cursor:pointer;border:0;font-family:inherit;transition:filter .16s}")
         .append("button.chip:hover{filter:brightness(.97)}")
         .append("button.chip:active{filter:brightness(.93)}")
         .append("</style></head><body><div class=\"wrap\">");

        b.append("<div class=\"brand\">").append(logo(52)).append("<h1>MokomailBrowser</h1></div>");

        b.append("<form class=\"search\" onsubmit=\"event.preventDefault();")
         .append("window.Home.search(document.getElementById('q').value);return false\">")
         .append(icon()).append("<input id=\"q\" type=\"text\" placeholder=\"")
         .append(esc(placeholder)).append("\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\">")
         .append("</form>");

        b.append("<div class=\"chips\">")
         .append("<button class=\"chip\" onclick=\"Home.openBookmarks()\">Закладки</button>")
         .append("<button class=\"chip\" onclick=\"Home.openHistory()\">История</button>")
         .append("<button class=\"chip\" onclick=\"Home.openDownloads()\">Загрузки</button>")
         .append("</div>");

        if (showTop) {
            if (links.length() > 0) {
                b.append("<div class=\"sec\"><span class=\"sec-title\">Часто посещаемые</span>")
                 .append("<div class=\"qls\">").append(links).append("</div></div>");
            } else {
                b.append("<div class=\"empty\">Откройте несколько сайтов — здесь появятся быстрые ссылки</div>");
            }
        }

        b.append("<div class=\"foot\">MokomailTeam &middot; TikTok @mokomail &middot; GitHub mokomail</div>");
        b.append("</div></body></html>");
        return b.toString();
    }

    private static String logo(int size) {
        return "<svg width=\"" + size + "\" height=\"" + size + "\" viewBox=\"0 0 108 108\" aria-hidden=\"true\">"
                + "<defs><linearGradient id=\"bp\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">"
                + "<stop offset=\"0\" stop-color=\"#6C8CFF\"/><stop offset=\"1\" stop-color=\"#3F5CD0\"/>"
                + "</linearGradient></defs>"
                + "<rect x=\"0\" y=\"0\" width=\"108\" height=\"108\" rx=\"24\" fill=\"url(#bp)\"/>"
                + "<circle cx=\"54\" cy=\"54\" r=\"30.375\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\"0.95\" stroke-width=\"5.06\"/>"
                + "<polygon points=\"54,27 64.125,54 54,81 43.875,54\" fill=\"#fff\"/></svg>";
    }

    private static String icon() {
        return "<svg width=\"21\" height=\"21\" viewBox=\"0 0 24 24\" fill=\"currentColor\">"
                + "<path d=\"M15.5,14h-0.79l-0.28,-0.27C15.41,12.59 16,11.11 16,9.5 16,5.91 13.09,3 9.5,3S3,5.91 3,9.5 5.91,16 9.5,16c1.61,0 3.09,-0.59 4.23,-1.57l0.27,0.28v0.79l5,4.99L20.49,19l-4.99,-5zM9.5,14C7.01,14 5,11.99 5,9.5S7.01,5 9.5,5 14,7.01 14,9.5 11.99,14 9.5,14z\"/>"
                + "</svg>";
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static String js(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("'", "\\'").replace("\"", "\\\"").replace("\n", " ");
    }

    private HomePage() {}
}
