package com.mokomail.browser;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Закладки и история. Значения держатся в памяти (кэш процесса), а на диск
 * пишутся через {@code apply()}. Это убирает разбор JSON на каждом переходе
 * страницы — раньше история и закладки читались/перезаписывались целиком
 * при каждой загрузке сайта.
 */
public class Store {

    private static final String NAME = "mokomail_data";
    private static final int HISTORY_LIMIT = 1500;

    private static List<Item> sBookmarks;
    private static List<Item> sHistory;

    private final SharedPreferences sp;

    public static class Item {
        public String title;
        public String url;
        public String favicon;
        public long time;

        public Item() {}

        public Item(String title, String url, String favicon, long time) {
            this.title = title;
            this.url = url;
            this.favicon = favicon;
            this.time = time;
        }
    }

    public Store(Context ctx) {
        sp = ctx.getApplicationContext().getSharedPreferences(NAME, Context.MODE_PRIVATE);
    }

    // ── Разбор / запись ─────────────────────────────────────────────────────

    private List<Item> load(String key) {
        List<Item> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(sp.getString(key, "[]"));
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.optJSONObject(i);
                if (o == null) continue;
                out.add(new Item(o.optString("title"), o.optString("url"),
                        o.optString("favicon"), o.optLong("time")));
            }
        } catch (Exception ignored) {}
        return out;
    }

    private void persist(String key, List<Item> items) {
        JSONArray arr = new JSONArray();
        for (Item it : items) {
            JSONObject o = new JSONObject();
            try {
                o.put("title", it.title == null ? "" : it.title);
                o.put("url", it.url);
                o.put("favicon", it.favicon == null ? "" : it.favicon);
                o.put("time", it.time);
            } catch (Exception ignored) {
                continue;
            }
            arr.put(o);
        }
        sp.edit().putString(key, arr.toString()).apply();
    }

    private List<Item> bookmarksCache() {
        if (sBookmarks == null) sBookmarks = load("bookmarks");
        return sBookmarks;
    }

    private List<Item> historyCache() {
        if (sHistory == null) sHistory = load("history");
        return sHistory;
    }

    // ── Закладки ───────────────────────────────────────────────────────────
    public List<Item> bookmarks() {
        return Collections.unmodifiableList(bookmarksCache());
    }

    public boolean isBookmarked(String url) {
        if (url == null) return false;
        for (Item it : bookmarksCache()) {
            if (url.equals(it.url)) return true;
        }
        return false;
    }

    public void addBookmark(String title, String url, String favicon) {
        if (url == null || url.isEmpty()) return;
        List<Item> list = bookmarksCache();
        for (Item it : list) {
            if (url.equals(it.url)) return;
        }
        list.add(0, new Item(title == null ? "" : title, url, favicon == null ? "" : favicon,
                System.currentTimeMillis()));
        persist("bookmarks", list);
    }

    public void removeBookmark(String url) {
        if (url == null) return;
        List<Item> list = bookmarksCache();
        boolean changed = false;
        for (int i = list.size() - 1; i >= 0; i--) {
            if (url.equals(list.get(i).url)) {
                list.remove(i);
                changed = true;
            }
        }
        if (changed) persist("bookmarks", list);
    }

    public void clearBookmarks() {
        bookmarksCache().clear();
        persist("bookmarks", sBookmarks);
    }

    // ── История ────────────────────────────────────────────────────────────
    /** Свежие сверху. */
    public List<Item> history() {
        List<Item> copy = new ArrayList<>(historyCache());
        Collections.reverse(copy);
        return copy;
    }

    public void addHistory(String title, String url, String favicon) {
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return;
        List<Item> h = historyCache();
        for (int i = h.size() - 1; i >= 0; i--) {
            if (url.equals(h.get(i).url)) {
                h.remove(i);
                break;
            }
        }
        h.add(new Item(title == null ? "" : title, url, favicon == null ? "" : favicon,
                System.currentTimeMillis()));
        while (h.size() > HISTORY_LIMIT) h.remove(0);
        persist("history", h);
    }

    public void clearHistory() {
        historyCache().clear();
        persist("history", sHistory);
    }

    /** Часто посещаемые сайты — по числу заходов. */
    public List<Item> topSites(int limit) {
        List<Item> h = historyCache();
        java.util.LinkedHashMap<String, Item> best = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, Integer> counts = new java.util.LinkedHashMap<>();
        for (int i = h.size() - 1; i >= 0; i--) {
            Item it = h.get(i);
            String host = hostOf(it.url);
            if (host == null) continue;
            Integer cur = counts.get(host);
            counts.put(host, cur == null ? 1 : cur + 1);
            // Идём от свежих к старым, поэтому оставляем первую (самую новую) запись.
            if (!best.containsKey(host)) best.put(host, it);
        }
        List<java.util.Map.Entry<String, Integer>> order = new ArrayList<>(counts.entrySet());
        Collections.sort(order, (a, b) -> b.getValue() - a.getValue());
        List<Item> out = new ArrayList<>();
        for (java.util.Map.Entry<String, Integer> e : order) {
            if (out.size() >= limit) break;
            out.add(best.get(e.getKey()));
        }
        return out;
    }

    public static String hostOf(String url) {
        if (url == null) return null;
        try {
            java.net.URL u = new java.net.URL(url);
            String host = u.getHost();
            if (host == null || host.isEmpty()) return null;
            return host.startsWith("www.") ? host.substring(4) : host;
        } catch (Exception e) {
            return null;
        }
    }
}
