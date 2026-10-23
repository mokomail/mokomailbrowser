package com.mokomail.browser;

import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.LinearLayout;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.google.android.material.appbar.MaterialToolbar;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;

import java.util.ArrayList;
import java.util.List;

/** Настройки в стиле Material 3. Все пункты реально работают. */
public class SettingsActivity extends AppCompatActivity {

    private Prefs prefs;
    private Store store;
    private LinearLayout content;
    private boolean dynamicAtCreate;
    private String accentAtCreate;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = new Prefs(this);
        store = new Store(this);
        dynamicAtCreate = prefs.dynamicColor();
        accentAtCreate = prefs.accentColor();
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        LinearLayout root = Ui.vertical(this);
        root.setBackgroundColor(Ui.col(this, com.google.android.material.R.attr.colorSurface));

        MaterialToolbar toolbar = new MaterialToolbar(this);
        toolbar.setTitle("Настройки");
        toolbar.setNavigationIcon(R.drawable.ic_arrow_back);
        toolbar.setNavigationIconTint(Ui.onSurface(this));
        toolbar.setNavigationContentDescription("Назад");
        toolbar.setNavigationOnClickListener(v -> finish());
        toolbar.setBackgroundColor(Ui.col(this, com.google.android.material.R.attr.colorSurface));
        root.addView(toolbar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        androidx.core.widget.NestedScrollView scroll = new androidx.core.widget.NestedScrollView(this);
        scroll.setClipToPadding(false);
        content = Ui.vertical(this);
        content.setPadding(Ui.dp(this, 12), 0, Ui.dp(this, 12), Ui.dp(this, 32));
        scroll.addView(content, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        setContentView(root);
        applyInsets(toolbar, scroll);
        buildSections();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (dynamicAtCreate != prefs.dynamicColor()
                || !accentAtCreate.equals(prefs.accentColor())) {
            recreate();
        }
    }

    private void applyInsets(View toolbar, View scroll) {
        WindowInsetsControllerCompat c =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        boolean night = (getResources().getConfiguration().uiMode
                & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
                == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        c.setAppearanceLightStatusBars(!night);
        c.setAppearanceLightNavigationBars(!night);

        ViewCompat.setOnApplyWindowInsetsListener(toolbar, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(0, bars.top, 0, 0);
            return insets;
        });
        ViewCompat.setOnApplyWindowInsetsListener(scroll, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(0, 0, 0, bars.bottom);
            return insets;
        });
    }

    private LinearLayout section(String title) {
        content.addView(Ui.label(this, title));
        MaterialCardView card = Ui.card(this);
        LinearLayout inner = Ui.vertical(this);
        card.addView(inner, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        content.addView(card);
        return inner;
    }

    private void addRow(LinearLayout parent, View row) {
        if (parent.getChildCount() > 0) parent.addView(Ui.divider(this));
        parent.addView(row);
    }

    /** Акцентные цвета: та же палитра, что в Windows-версии, с живым выбором. */
    private View accentRow() {
        LinearLayout box = Ui.vertical(this);
        box.setPadding(Ui.dp(this, 16), Ui.dp(this, 12), Ui.dp(this, 16), Ui.dp(this, 14));

        com.google.android.material.textview.MaterialTextView title =
                new com.google.android.material.textview.MaterialTextView(this);
        title.setText("Акцентный цвет");
        title.setTextSize(14);
        title.setTextColor(Ui.onSurface(this));
        box.addView(title);

        com.google.android.material.textview.MaterialTextView sub =
                new com.google.android.material.textview.MaterialTextView(this);
        sub.setText(prefs.dynamicColor()
                ? "Сейчас палитра берётся из обоев. Выберите цвет, чтобы задать свою."
                : "Схема Material 3 строится из выбранного цвета");
        sub.setTextSize(12);
        sub.setTextColor(Ui.onSurfaceVariant(this));
        box.addView(sub);

        boolean dynamic = prefs.dynamicColor();
        String current = Accents.normalize(prefs.accentColor());
        int perRow = 5;
        for (int start = 0; start < Accents.ALL.length; start += perRow) {
            LinearLayout row = Ui.horizontal(this);
            LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            rlp.topMargin = Ui.dp(this, 12);
            row.setLayoutParams(rlp);
            for (int i = start; i < Math.min(start + perRow, Accents.ALL.length); i++) {
                final String hex = Accents.ALL[i];
                boolean selected = !dynamic && hex.equals(current);
                View sw = Accents.swatch(this, hex, selected, () -> {
                    prefs.setAccentColor(hex);
                    prefs.setDynamicColor(false);
                    recreate();
                });
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                        Ui.dp(this, 46), Ui.dp(this, 46));
                lp.setMarginEnd(Ui.dp(this, 10));
                row.addView(sw, lp);
            }
            box.addView(row);
        }
        return box;
    }

    private void buildSections() {
        // ── Поисковая система ───────────────────────────────────────────────
        LinearLayout search = section("ПОИСКОВАЯ СИСТЕМА");
        addRow(search, Ui.navRow(this, R.drawable.ic_search, "Поисковая система",
                Engines.name(prefs.searchEngine()), this::chooseEngine));
        addRow(search, Ui.navRow(this, R.drawable.ic_globe, "Своя поисковая ссылка",
                prefs.customSearchUrl().isEmpty() ? "Не задана" : prefs.customSearchUrl(),
                this::editCustomSearch));

        // ── Домашняя страница ───────────────────────────────────────────────
        LinearLayout home = section("ДОМАШНЯЯ СТРАНИЦА");
        addRow(home, Ui.navRow(this, R.drawable.ic_home, "Адрес домашней страницы",
                prefs.homepage(), this::editHomepage));
        addRow(home, Ui.actionRow(this, R.drawable.ic_reload, "Сбросить на домашнюю поисковика",
                () -> {
                    String h = Engines.home(prefs.searchEngine());
                    if (h != null && !h.isEmpty()) {
                        prefs.setHomepage(h);
                        snack("Домашняя страница обновлена");
                        rebuild();
                    }
                }));
        addRow(home, Ui.switchRow(this, R.drawable.ic_history, "Показывать «Часто посещаемые»",
                "Плитки из истории на новой вкладке",
                prefs.showTopSites(), (b, checked) -> prefs.setShowTopSites(checked)));

        // ── Внешний вид ─────────────────────────────────────────────────────
        LinearLayout look = section("ВНЕШНИЙ ВИД");
        addRow(look, Ui.navRow(this, R.drawable.ic_palette, "Тема",
                App.themeLabel(prefs.themeMode()), this::chooseTheme));
        if (Accents.isAvailable()) {
            addRow(look, accentRow());
            addRow(look, Ui.switchRow(this, R.drawable.ic_palette, "Динамические цвета",
                    "Material You — цвета под обои (Android 12+)",
                    prefs.dynamicColor(), (b, checked) -> {
                        prefs.setDynamicColor(checked);
                        recreate();
                    }));
        }
        addRow(look, Ui.switchRow(this, R.drawable.ic_reload, "Анимации интерфейса",
                "Плавные переходы при переключении вкладок",
                prefs.animations(), (b, checked) -> prefs.setAnimations(checked)));

        // ── Приватность ─────────────────────────────────────────────────────
        LinearLayout privacy = section("ПРИВАТНОСТЬ И БЕЗОПАСНОСТЬ");
        addRow(privacy, Ui.switchRow(this, R.drawable.ic_shield, "Блокировать всплывающие окна",
                null, prefs.blockPopups(), (b, checked) -> prefs.setBlockPopups(checked)));
        addRow(privacy, Ui.switchRow(this, R.drawable.ic_lock, "Сохранять историю посещений",
                null, prefs.saveHistory(), (b, checked) -> prefs.setSaveHistory(checked)));
        addRow(privacy, Ui.switchRow(this, R.drawable.ic_desktop, "Версия для ПК по умолчанию",
                null, prefs.desktopUa(), (b, checked) -> prefs.setDesktopUa(checked)));

        // ── Данные ──────────────────────────────────────────────────────────
        LinearLayout data = section("ДАННЫЕ");
        addRow(data, Ui.actionRow(this, R.drawable.ic_history, "Очистить историю",
                () -> confirm("Очистить историю посещений?", () -> {
                    store.clearHistory();
                    snack("История очищена");
                })));
        addRow(data, Ui.actionRow(this, R.drawable.ic_delete, "Очистить cookie и кэш",
                () -> confirm("Очистить cookie и кэш?", () -> {
                    clearWebData();
                    snack("Cookie и кэш очищены");
                })));
        addRow(data, Ui.actionRow(this, R.drawable.ic_bookmarks, "Очистить закладки",
                () -> confirm("Удалить все закладки?", () -> {
                    store.clearBookmarks();
                    snack("Закладки очищены");
                })));
        addRow(data, Ui.actionRow(this, R.drawable.ic_delete, "Сбросить все настройки",
                () -> confirm("Сбросить все настройки и данные?", this::resetAll)));

        // ── О браузере ──────────────────────────────────────────────────────
        LinearLayout about = section("О БРАУЗЕРЕ");
        addRow(about, Ui.navRow(this, R.drawable.ic_palette, "Первоначальная настройка",
                "Пройти мастер настройки заново",
                () -> startActivity(new Intent(this, OnboardingActivity.class))));
        addRow(about, Ui.navRow(this, R.drawable.ic_info, "MokomailBrowser",
                "Версия " + version(), () -> startActivity(new Intent(this, AboutActivity.class))));
        addRow(about, Ui.actionRow(this, R.drawable.ic_globe, "TikTok — @mokomail",
                () -> openLink("https://www.tiktok.com/@mokomail")));
        addRow(about, Ui.actionRow(this, R.drawable.ic_globe, "GitHub — mokomail",
                () -> openLink("https://github.com/mokomail")));
    }

    // ── Диалоги ─────────────────────────────────────────────────────────────

    private void chooseEngine() {
        List<Engines.Engine> list = Engines.list();
        List<String> names = new ArrayList<>();
        int checked = 0;
        for (int i = 0; i < list.size(); i++) {
            names.add(list.get(i).name);
            if (list.get(i).id.equals(prefs.searchEngine())) checked = i;
        }
        new MaterialAlertDialogBuilder(this)
                .setTitle("Поисковая система")
                .setSingleChoiceItems(names.toArray(new String[0]), checked, (d, which) -> {
                    Engines.Engine e = list.get(which);
                    prefs.setSearchEngine(e.id);
                    if (e.home != null && !e.home.isEmpty()) prefs.setHomepage(e.home);
                    d.dismiss();
                    snack("Поиск: " + e.name);
                    rebuild();
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void editCustomSearch() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("https://example.com/search?q=%s");
        input.setText(prefs.customSearchUrl());
        LinearLayout box = Ui.vertical(this);
        box.setPadding(Ui.dp(this, 24), Ui.dp(this, 8), Ui.dp(this, 24), 0);
        box.addView(input);
        new MaterialAlertDialogBuilder(this)
                .setTitle("Своя поисковая ссылка")
                .setMessage("Укажите адрес, где %s заменится на запрос.")
                .setView(box)
                .setPositiveButton("Сохранить", (d, w) -> {
                    prefs.setCustomSearchUrl(input.getText().toString().trim());
                    snack("Сохранено");
                    rebuild();
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void editHomepage() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("https://example.com/");
        input.setText(prefs.homepage());
        LinearLayout box = Ui.vertical(this);
        box.setPadding(Ui.dp(this, 24), Ui.dp(this, 8), Ui.dp(this, 24), 0);
        box.addView(input);
        new MaterialAlertDialogBuilder(this)
                .setTitle("Домашняя страница")
                .setView(box)
                .setPositiveButton("Сохранить", (d, w) -> {
                    String v = input.getText().toString().trim();
                    if (!v.isEmpty()) {
                        prefs.setHomepage(v.startsWith("http") ? v : "https://" + v);
                        snack("Сохранено");
                        rebuild();
                    }
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void chooseTheme() {
        final String[] values = {"system", "light", "dark"};
        String[] names = {"Системная", "Светлая", "Тёмная"};
        int checked = 0;
        for (int i = 0; i < values.length; i++) {
            if (values[i].equals(prefs.themeMode())) checked = i;
        }
        new MaterialAlertDialogBuilder(this)
                .setTitle("Тема оформления")
                .setSingleChoiceItems(names, checked, (d, which) -> {
                    prefs.setThemeMode(values[which]);
                    androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode(App.nightMode(values[which]));
                    d.dismiss();
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void confirm(String title, Runnable action) {
        new MaterialAlertDialogBuilder(this)
                .setTitle(title)
                .setPositiveButton("Да", (d, w) -> action.run())
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void clearWebData() {
        android.webkit.CookieManager.getInstance().removeAllCookies(null);
        android.webkit.CookieManager.getInstance().flush();
        android.webkit.WebStorage.getInstance().deleteAllData();
        try {
            android.webkit.WebView cleaner = new android.webkit.WebView(getApplicationContext());
            cleaner.clearCache(true);
            cleaner.destroy();
        } catch (Exception ignored) {}
    }

    private void resetAll() {
        prefs.clearAll();
        store.clearBookmarks();
        store.clearHistory();
        clearWebData();
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
        finish();
    }

    private void openLink(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)));
        } catch (Exception ignored) {}
    }

    private String version() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "1.0";
        }
    }

    private void snack(String text) {
        com.google.android.material.snackbar.Snackbar
                .make(findViewById(android.R.id.content), text,
                        com.google.android.material.snackbar.Snackbar.LENGTH_SHORT)
                .show();
    }

    private void rebuild() {
        content.removeAllViews();
        buildSections();
    }
}
