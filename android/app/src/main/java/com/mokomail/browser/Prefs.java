package com.mokomail.browser;

import android.content.Context;
import android.content.SharedPreferences;

/** Настройки профиля (аналог settings.json в настольной версии). */
public class Prefs {

    private static final String NAME = "mokomail_settings";
    private final SharedPreferences sp;

    public Prefs(Context ctx) {
        sp = ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE);
    }

    public String searchEngine() { return sp.getString("searchEngine", "google"); }
    public void setSearchEngine(String v) { sp.edit().putString("searchEngine", v).apply(); }

    public String customSearchUrl() { return sp.getString("customSearchUrl", ""); }
    public void setCustomSearchUrl(String v) { sp.edit().putString("customSearchUrl", v).apply(); }

    public String homepage() { return sp.getString("homepage", "https://www.google.com/"); }
    public void setHomepage(String v) { sp.edit().putString("homepage", v).apply(); }

    public boolean onboardingDone() { return sp.getBoolean("onboardingDone", false); }
    public void setOnboardingDone(boolean v) { sp.edit().putBoolean("onboardingDone", v).apply(); }

    public boolean blockPopups() { return sp.getBoolean("blockPopups", true); }
    public void setBlockPopups(boolean v) { sp.edit().putBoolean("blockPopups", v).apply(); }

    public boolean saveHistory() { return sp.getBoolean("saveHistory", true); }
    public void setSaveHistory(boolean v) { sp.edit().putBoolean("saveHistory", v).apply(); }

    public boolean desktopUa() { return sp.getBoolean("desktopUa", false); }
    public void setDesktopUa(boolean v) { sp.edit().putBoolean("desktopUa", v).apply(); }

    /** Тема: "system" | "light" | "dark". */
    public String themeMode() { return sp.getString("themeMode", "system"); }
    public void setThemeMode(String v) { sp.edit().putString("themeMode", v).apply(); }

    /** Material You — динамические цвета системных обоев (Android 12+). */
    public boolean dynamicColor() { return sp.getBoolean("dynamicColor", true); }
    public void setDynamicColor(boolean v) { sp.edit().putBoolean("dynamicColor", v).apply(); }

    /** Опорный цвет Material 3, если Material You выключен (Android 12+). */
    public String accentColor() { return sp.getString("accentColor", Accents.DEFAULT); }
    public void setAccentColor(String v) { sp.edit().putString("accentColor", Accents.normalize(v)).apply(); }

    /** Плитки «Часто посещаемые» на домашней странице. */
    public boolean showTopSites() { return sp.getBoolean("showTopSites", true); }
    public void setShowTopSites(boolean v) { sp.edit().putBoolean("showTopSites", v).apply(); }

    /** Анимации интерфейса (переключение вкладок и т. п.). */
    public boolean animations() { return sp.getBoolean("animations", true); }
    public void setAnimations(boolean v) { sp.edit().putBoolean("animations", v).apply(); }

    public void clearAll() { sp.edit().clear().apply(); }
}
