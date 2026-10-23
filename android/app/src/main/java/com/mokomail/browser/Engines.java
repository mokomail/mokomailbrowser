package com.mokomail.browser;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Поисковые системы — порт src/shared/search-engines.js. */
public final class Engines {

    public static final class Engine {
        public final String id;
        public final String name;
        public final String url;
        public final String home;

        Engine(String id, String name, String url, String home) {
            this.id = id;
            this.name = name;
            this.url = url;
            this.home = home;
        }
    }

    public static final Map<String, Engine> ALL = new LinkedHashMap<>();

    static {
        add(new Engine("google", "Google", "https://www.google.com/search?q=%s", "https://www.google.com/"));
        add(new Engine("yandex", "Яндекс", "https://yandex.ru/search/?text=%s", "https://yandex.ru/"));
        add(new Engine("duckduckgo", "DuckDuckGo", "https://duckduckgo.com/?q=%s", "https://duckduckgo.com/"));
        add(new Engine("bing", "Bing", "https://www.bing.com/search?q=%s", "https://www.bing.com/"));
        add(new Engine("mail", "Mail.ru", "https://go.mail.ru/search?q=%s", "https://go.mail.ru/"));
        add(new Engine("wikipedia", "Википедия", "https://ru.wikipedia.org/w/index.php?search=%s", "https://ru.wikipedia.org/"));
        add(new Engine("custom", "Своя ссылка", "%s", ""));
    }

    private static void add(Engine e) {
        ALL.put(e.id, e);
    }

    public static Engine get(String id) {
        Engine e = ALL.get(id);
        return e != null ? e : ALL.get("google");
    }

    public static String name(String id) {
        return get(id).name;
    }

    public static String home(String id) {
        return get(id).home;
    }

    public static List<Engine> list() {
        return new ArrayList<>(ALL.values());
    }

    public static List<String> ids() {
        List<String> out = new ArrayList<>(ALL.keySet());
        return out;
    }

    public static String buildSearchUrl(String engineId, String query, String custom) {
        Engine e = get(engineId);
        String tpl;
        if ("custom".equals(e.id)) {
            tpl = (custom == null || custom.trim().isEmpty()) ? get("google").url : custom;
        } else {
            tpl = e.url;
        }
        return tpl.replace("%s", encode(query));
    }

    private static String encode(String value) {
        try {
            return URLEncoder.encode(value == null ? "" : value, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            return value == null ? "" : value;
        }
    }

    private Engines() {}
}
