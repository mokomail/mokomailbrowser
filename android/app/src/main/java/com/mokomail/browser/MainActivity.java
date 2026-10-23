package com.mokomail.browser;

import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.text.InputType;
import android.text.TextUtils;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.android.material.appbar.MaterialToolbar;
import com.google.android.material.bottomsheet.BottomSheetDialog;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.progressindicator.LinearProgressIndicator;
import com.google.android.material.textview.MaterialTextView;

import java.util.ArrayList;
import java.util.List;

/** Главный экран браузера в стиле Material 3 / Material You. */
public class MainActivity extends AppCompatActivity {

    private static final String HOME_URL = "https://home.mokomail.local/";
    private static final String DESKTOP_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/124.0.0.0 Safari/537.36";

    private Prefs prefs;
    private Store store;

    private EditText omnibox;
    private ImageView omniboxIcon;
    private MaterialButton backBtn, forwardBtn, homeBtn, tabsBtn, menuBtn, starBtn, reloadBtn;
    private android.widget.TextView tabsBadge;
    private android.widget.TextView incognitoChip;
    private com.google.android.material.progressindicator.LinearProgressIndicator progress;
    private androidx.swiperefreshlayout.widget.SwipeRefreshLayout refresh;
    private android.widget.FrameLayout webContainer;

    private final java.util.List<Tab> tabs = new java.util.ArrayList<>();
    private int active = -1;
    private boolean dynamicAtCreate;
    private String themeAtCreate;
    private String accentAtCreate;
    private boolean showTopAtCreate;
    private boolean wasNight;
    private boolean homeApplied;

    private static class Tab {
        WebView wv;
        String title = "";
        String url = "";
        String favicon = "";
        Bitmap icon;
        boolean incognito;
        boolean isHome = true;
        boolean loading;
    }

    // ── Жизненный цикл ──────────────────────────────────────────────────────

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = new Prefs(this);
        store = new Store(this);
        dynamicAtCreate = prefs.dynamicColor();
        themeAtCreate = prefs.themeMode();
        accentAtCreate = prefs.accentColor();
        showTopAtCreate = prefs.showTopSites();
        wasNight = isNight();
        homeApplied = prefs.onboardingDone();

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_main);
        bindViews();
        wireUi();
        applyInsets();

        String[] urls = savedInstanceState == null ? null : savedInstanceState.getStringArray("tabUrls");
        if (urls != null && urls.length > 0) {
            boolean[] inc = savedInstanceState.getBooleanArray("tabInc");
            for (int i = 0; i < urls.length; i++) {
                String u = urls[i];
                boolean isInc = inc != null && inc[i];
                // Не восстанавливаем приватные вкладки из savedInstanceState
                if (isInc) continue;
                if (u == null || u.isEmpty()) continue;
                newTab(u, false, false);
            }
            if (tabs.size() == 0) {
                newTab(prefs.onboardingDone() ? prefs.homepage() : null, false, false);
                if (!prefs.onboardingDone()) {
                    startActivity(new Intent(this, OnboardingActivity.class));
                } else {
                    handleIntent(getIntent());
                }
            } else {
                int act = savedInstanceState.getInt("tabActive", 0);
                // активной может быть только неинкогнито вкладка
                setActive(Math.min(act, tabs.size() - 1));
            }
        } else {
            newTab(prefs.onboardingDone() ? prefs.homepage() : null, false, false);
            if (!prefs.onboardingDone()) {
                startActivity(new Intent(this, OnboardingActivity.class));
            } else {
                handleIntent(getIntent());
            }
        }
    }

    private void bindViews() {
        omnibox = findViewById(R.id.omnibox);
        omniboxIcon = findViewById(R.id.omniboxIcon);
        backBtn = findViewById(R.id.backButton);
        forwardBtn = findViewById(R.id.forwardButton);
        homeBtn = findViewById(R.id.homeButton);
        tabsBtn = findViewById(R.id.tabsButton);
        menuBtn = findViewById(R.id.menuButton);
        starBtn = findViewById(R.id.starButton);
        reloadBtn = findViewById(R.id.reloadButton);
        tabsBadge = findViewById(R.id.tabsBadge);
        incognitoChip = findViewById(R.id.incognitoChip);
        progress = findViewById(R.id.progress);
        refresh = findViewById(R.id.refresh);
        webContainer = findViewById(R.id.webContainer);
    }

    private void wireUi() {
        omnibox.setInputType(InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        omnibox.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE
                    || actionId == EditorInfo.IME_ACTION_NEXT) {
                navigate(omnibox.getText().toString());
                omnibox.clearFocus();
                hideKeyboard();
                return true;
            }
            return false;
        });
        omnibox.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) {
                Tab t = activeTab();
                if (t != null && (t.isHome || isHome(t.url))) {
                    omnibox.setText("");
                } else {
                    omnibox.post(omnibox::selectAll);
                }
            }
        });

        backBtn.setIconTint(Ui.navTint(this));
        forwardBtn.setIconTint(Ui.navTint(this));
        homeBtn.setIconTint(Ui.navTint(this));
        tabsBtn.setIconTint(Ui.navTint(this));
        menuBtn.setIconTint(Ui.navTint(this));

        backBtn.setOnClickListener(v -> {
            Tab t = activeTab();
            if (t != null && t.wv.canGoBack()) t.wv.goBack();
        });
        forwardBtn.setOnClickListener(v -> {
            Tab t = activeTab();
            if (t != null && t.wv.canGoForward()) t.wv.goForward();
        });
        homeBtn.setOnClickListener(v -> {
            Tab t = activeTab();
            if (t != null) loadHome(t);
        });
        tabsBtn.setOnClickListener(v -> showTabSwitcher());
        menuBtn.setOnClickListener(v -> showMenuSheet());
        starBtn.setOnClickListener(v -> toggleBookmark());
        reloadBtn.setOnClickListener(v -> {
            Tab t = activeTab();
            if (t == null) return;
            if (t.loading) t.wv.stopLoading();
            else t.wv.reload();
        });

        refresh.setColorSchemeColors(Ui.primary(this));
        refresh.setProgressBackgroundColorSchemeColor(Ui.surfaceContainerHigh(this));
        refresh.setOnRefreshListener(() -> {
            Tab t = activeTab();
            if (t != null) t.wv.reload();
            else refresh.setRefreshing(false);
        });
    }

    private void applyInsets() {
        final View header = findViewById(R.id.header);
        final View bottom = findViewById(R.id.bottomBar);
        ViewCompat.setOnApplyWindowInsetsListener(header, (v, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            v.setPadding(v.getPaddingLeft(), bars.top + dp(2), v.getPaddingRight(), v.getPaddingBottom());
            return insets;
        });
        ViewCompat.setOnApplyWindowInsetsListener(bottom, (v, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            v.setPadding(v.getPaddingLeft(), v.getPaddingTop(), v.getPaddingRight(), bars.bottom + dp(4));
            return insets;
        });
        applySystemBarIcons();
    }

    private void applySystemBarIcons() {
        androidx.core.view.WindowInsetsControllerCompat c =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setAppearanceLightStatusBars(!isNight());
        c.setAppearanceLightNavigationBars(!isNight());
    }

    private boolean isNight() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        String url = intent.getData().toString();
        if (url.startsWith("http://") || url.startsWith("https://")) {
            Tab t = activeTab();
            if (t != null && t.isHome) {
                t.isHome = false;
                t.wv.loadUrl(url);
            } else {
                newTab(url, false, true);
            }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        String[] urls = new String[tabs.size()];
        boolean[] inc = new boolean[tabs.size()];
        for (int i = 0; i < tabs.size(); i++) {
            urls[i] = tabs.get(i).isHome ? null : tabs.get(i).url;
            inc[i] = tabs.get(i).incognito;
        }
        outState.putStringArray("tabUrls", urls);
        outState.putBooleanArray("tabInc", inc);
        outState.putInt("tabActive", active);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        boolean night = (newConfig.uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        if (night != wasNight) {
            recreate();
        } else {
            applySystemBarIcons();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (dynamicAtCreate != prefs.dynamicColor()
                || !themeAtCreate.equals(prefs.themeMode())
                || !accentAtCreate.equals(prefs.accentColor())) {
            recreate();
            return;
        }
        if (showTopAtCreate != prefs.showTopSites()) {
            showTopAtCreate = prefs.showTopSites();
            Tab t = activeTab();
            if (t != null && (t.isHome || isHome(t.url))) loadHome(t);
        }
        if (prefs.onboardingDone() && !homeApplied) {
            homeApplied = true;
            Tab t = activeTab();
            if (t != null) loadHome(t);
        }
    }

    @Override
    protected void onDestroy() {
        for (Tab t : new ArrayList<>(tabs)) {
            webContainer.removeView(t.wv);
            t.wv.destroy();
        }
        tabs.clear();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (omnibox.hasFocus()) {
            omnibox.clearFocus();
            hideKeyboard();
            return;
        }
        Tab t = activeTab();
        if (t != null && t.wv.canGoBack()) {
            t.wv.goBack();
            return;
        }
        if (tabs.size() > 1) {
            closeTab(tabs.indexOf(t));
            return;
        }
        super.onBackPressed();
    }

    // ── Вкладки ─────────────────────────────────────────────────────────────

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void newTab(String url, final boolean incognito, boolean makeActive) {
        final WebView wv = new WebView(this.getApplicationContext());
        final Tab tab = new Tab();
        tab.wv = wv;
        tab.incognito = incognito;

        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(!prefs.blockPopups());
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        // Оптимизация: меньше обращений к диску и лишних разрешений.
        s.setSaveFormData(false);
        s.setGeolocationEnabled(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setDefaultTextEncodingName("utf-8");
        if (prefs.desktopUa()) s.setUserAgentString(DESKTOP_UA);
        wv.setBackgroundColor(Ui.col(this, com.google.android.material.R.attr.colorSurface));
        wv.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);

        wv.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String u) {
                return handleUrl(u);
            }

            @Override
            public void onPageStarted(WebView view, String u, Bitmap fav) {
                tab.url = u;
                tab.isHome = isHome(u);
                tab.loading = true;
                if (tab == activeTab()) {
                    updateOmnibox();
                    updateReloadButton();
                }
            }

            @Override
            public void onPageFinished(WebView view, String u) {
                tab.url = u;
                tab.loading = false;
                if (view.getTitle() != null && !view.getTitle().isEmpty()) tab.title = view.getTitle();
                if (!tab.incognito && prefs.saveHistory() && !isHome(u)) {
                    store.addHistory(tab.title, u, tab.favicon);
                }
                if (tab == activeTab()) {
                    updateOmnibox();
                    updateNav();
                    updateStar();
                    updateReloadButton();
                    refresh.setRefreshing(false);
                }
            }

            @Override
            public void onReceivedError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceError error) {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                    if (request == null || !request.isForMainFrame()) return;
                    String failingUrl = request.getUrl() == null ? tab.url : request.getUrl().toString();
                    if (isHome(failingUrl)) return;
                    String desc = error.getDescription() == null ? "" : error.getDescription().toString();
                    view.loadDataWithBaseURL(null, errorPage(desc, failingUrl), "text/html", "utf-8", null);
                    return;
                }
                // fallback
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // только для основного фрейма
                if (failingUrl == null) return;
                if (isHome(failingUrl)) return;
                view.loadDataWithBaseURL(null, errorPage(description, failingUrl), "text/html", "utf-8", null);
            }

            @Override
            public void onReceivedSslError(WebView view, final SslErrorHandler handler, android.net.http.SslError error) {
                new com.google.android.material.dialog.MaterialAlertDialogBuilder(MainActivity.this)
                        .setTitle("Небезопасное соединение")
                        .setMessage("Сертификат сайта недействителен:\n" + error.getUrl())
                        .setPositiveButton("Продолжить", (d, w) -> handler.proceed())
                        .setNegativeButton("Отмена", (d, w) -> handler.cancel())
                        .show();
            }
        });

        wv.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) {
                if (tab != activeTab()) return;
                progress.setProgressCompat(p, true);
                progress.setVisibility(p >= 100 ? View.INVISIBLE : View.VISIBLE);
            }

            @Override
            public void onReceivedTitle(WebView view, String title) {
                tab.title = title == null ? "" : title;
                if (tab == activeTab()) updateOmnibox();
            }

            @Override
            public void onReceivedIcon(WebView view, Bitmap icon) {
                tab.icon = icon;
                if (tab == activeTab()) updateOmniboxIcon();
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                if (prefs.blockPopups()) {
                    snack("Всплывающее окно заблокировано");
                    return false;
                }
                final WebView tmp = new WebView(MainActivity.this);
                WebSettings ts = tmp.getSettings();
                ts.setJavaScriptEnabled(true);
                ts.setDomStorageEnabled(true);
                ts.setDatabaseEnabled(true);
                ts.setLoadWithOverviewMode(true);
                ts.setUseWideViewPort(true);
                ts.setBuiltInZoomControls(true);
                ts.setDisplayZoomControls(false);
                ts.setSupportZoom(true);
                ts.setSupportMultipleWindows(false);
                ts.setJavaScriptCanOpenWindowsAutomatically(false);
                ts.setAllowFileAccess(false);
                ts.setAllowContentAccess(false);
                ts.setSaveFormData(false);
                ts.setGeolocationEnabled(false);
                ts.setMediaPlaybackRequiresUserGesture(true);
                if (prefs.desktopUa()) ts.setUserAgentString(DESKTOP_UA);
                tmp.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, String u) {
                        newTab(u, incognito, true);
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(tmp);
                resultMsg.sendToTarget();
                return true;
            }
        });

        wv.setDownloadListener((downloadUrl, userAgent, contentDisposition, mimetype, contentLength) ->
                enqueueDownload(downloadUrl, contentDisposition, mimetype, incognito));

        // Долгое нажатие по ссылке/картинке — контекстное меню (как в Chrome).
        wv.setOnLongClickListener(v -> {
            WebView target = (WebView) v;
            WebView.HitTestResult hit = target.getHitTestResult();
            if (hit == null) return false;
            String extra = hit.getExtra();
            if (extra == null || extra.isEmpty()) return false;
            switch (hit.getType()) {
                case WebView.HitTestResult.SRC_ANCHOR_TYPE:
                case WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE:
                    showLinkMenu(extra);
                    return true;
                case WebView.HitTestResult.IMAGE_TYPE:
                    showImageMenu(extra);
                    return true;
                default:
                    return false;
            }
        });

        // JS-мост только для домашней страницы, чтобы ограничить доступ
        if (isHome(url) || url == null || url.trim().isEmpty()) {
            try { wv.addJavascriptInterface(new HomeBridge(), "Home"); } catch (Exception ignored) {}
        }

        wv.setVisibility(View.GONE);
        webContainer.addView(wv, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        tabs.add(tab);
        if (makeActive || tabs.size() == 1) setActive(tabs.size() - 1);
        else updateTabsBadge();

        if (url == null || url.trim().isEmpty() || isHome(url)) {
            loadHome(tab);
        } else {
            tab.isHome = false;
            wv.loadUrl(normalize(url));
        }
    }

    private void setActive(int index) {
        if (index < 0 || index >= tabs.size()) return;
        for (int i = 0; i < tabs.size(); i++) {
            tabs.get(i).wv.setVisibility(i == index ? View.VISIBLE : View.GONE);
        }
        active = index;
        webContainer.bringChildToFront(tabs.get(index).wv);
        animateTabIn(tabs.get(index).wv);
        updateOmnibox();
        updateOmniboxIcon();
        updateNav();
        updateStar();
        updateTabsBadge();
        updateReloadButton();
        updateIncognitoChip();
        progress.setVisibility(View.INVISIBLE);
    }

    /**
     * Мягкое появление вкладки: лёгкий подъём снизу и проявление.
     * Уважает системный масштаб анимаций (отключённые анимации — без эффекта).
     */
    private void animateTabIn(View v) {
        if (v == null) return;
        v.animate().cancel();
        if (!animationsEnabled()) {
            v.setAlpha(1f);
            v.setTranslationY(0f);
            return;
        }
        v.setAlpha(0f);
        v.setTranslationY(dp(12));
        v.animate()
                .alpha(1f)
                .translationY(0f)
                .setDuration(220)
                .setInterpolator(new android.view.animation.DecelerateInterpolator())
                .start();
    }

    private boolean animationsEnabled() {
        if (!prefs.animations()) return false;
        try {
            float scale = android.provider.Settings.Global.getFloat(getContentResolver(),
                    android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f);
            return scale > 0f;
        } catch (Exception e) {
            return true;
        }
    }

    private Tab activeTab() {
        return (active >= 0 && active < tabs.size()) ? tabs.get(active) : null;
    }

    private void closeTab(int index) {
        if (index < 0 || index >= tabs.size()) return;
        Tab t = tabs.remove(index);
        webContainer.removeView(t.wv);
        t.wv.loadUrl("about:blank");
        t.wv.destroy();
        if (tabs.isEmpty()) {
            newTab(prefs.homepage(), false, true);
            return;
        }
        if (active >= tabs.size()) active = tabs.size() - 1;
        else if (active > index) active--;
        active = Math.max(0, active);
        for (int i = 0; i < tabs.size(); i++) {
            tabs.get(i).wv.setVisibility(i == active ? View.VISIBLE : View.GONE);
        }
        webContainer.bringChildToFront(tabs.get(active).wv);
        animateTabIn(tabs.get(active).wv);
        updateOmnibox();
        updateOmniboxIcon();
        updateNav();
        updateStar();
        updateTabsBadge();
        updateIncognitoChip();
    }

    private void closeAllTabs() {
        for (Tab t : new ArrayList<>(tabs)) {
            webContainer.removeView(t.wv);
            t.wv.loadUrl("about:blank");
            t.wv.destroy();
        }
        tabs.clear();
        active = -1;
        newTab(null, false, true);
    }

    private void loadHome(Tab tab) {
        tab.isHome = true;
        tab.url = HOME_URL;
        tab.title = "MokomailBrowser";
        tab.icon = null;
        String html = HomePage.html(store.topSites(8), Engines.name(prefs.searchEngine()),
                homeColors(), prefs.showTopSites());
        tab.wv.loadDataWithBaseURL(HOME_URL, html, "text/html", "utf-8", null);
        if (tab == activeTab()) {
            updateOmnibox();
            updateOmniboxIcon();
            updateStar();
        }
    }

    private HomePage.Colors homeColors() {
        HomePage.Colors c = new HomePage.Colors();
        int A = com.google.android.material.R.attr.colorPrimary;
        c.primary = hex(Ui.col(this, com.google.android.material.R.attr.colorPrimary));
        c.onPrimary = hex(Ui.col(this, com.google.android.material.R.attr.colorOnPrimary));
        c.primaryContainer = hex(Ui.col(this, com.google.android.material.R.attr.colorPrimaryContainer));
        c.onPrimaryContainer = hex(Ui.col(this, com.google.android.material.R.attr.colorOnPrimaryContainer));
        c.surface = hex(Ui.col(this, com.google.android.material.R.attr.colorSurface));
        c.surfaceContainer = hex(Ui.col(this, com.google.android.material.R.attr.colorSurfaceContainer));
        c.surfaceContainerHigh = hex(Ui.col(this, com.google.android.material.R.attr.colorSurfaceContainerHigh));
        c.onSurface = hex(Ui.col(this, com.google.android.material.R.attr.colorOnSurface));
        c.onSurfaceVariant = hex(Ui.col(this, com.google.android.material.R.attr.colorOnSurfaceVariant));
        c.outlineVariant = hex(Ui.col(this, com.google.android.material.R.attr.colorOutlineVariant));
        return c;
    }

    private static String hex(int color) {
        return String.format("#%06X", 0xFFFFFF & color);
    }

    // ── Навигация ───────────────────────────────────────────────────────────

    private class HomeBridge {
        @JavascriptInterface
        public void search(String query) {
            runOnUiThread(() -> navigate(query));
        }

        @JavascriptInterface
        public void openUrl(String url) {
            runOnUiThread(() -> navigate(url));
        }

        @JavascriptInterface
        public void openBookmarks() {
            runOnUiThread(() -> showListSheet("Закладки", store.bookmarks(), true));
        }

        @JavascriptInterface
        public void openHistory() {
            runOnUiThread(() -> showListSheet("История", store.history(), false));
        }

        @JavascriptInterface
        public void openDownloads() {
            runOnUiThread(MainActivity.this::showDownloads);
        }
    }

    private void navigate(String input) {
        if (input == null) return;
        String q = input.trim();
        if (q.isEmpty()) return;
        Tab t = activeTab();
        if (t == null) {
            newTab(q, false, true);
            return;
        }
        t.isHome = false;
        t.wv.loadUrl(toUrl(q));
    }

    private String toUrl(String q) {
        if (looksLikeUrl(q)) return normalize(q);
        return Engines.buildSearchUrl(prefs.searchEngine(), q, prefs.customSearchUrl());
    }

    private static String normalize(String u) {
        String t = u == null ? "" : u.trim();
        if (t.startsWith("http://") || t.startsWith("https://") || t.startsWith("file:")
                || t.startsWith("about:") || t.startsWith("data:")) {
            return t;
        }
        return "https://" + t;
    }

    private static boolean looksLikeUrl(String s) {
        String t = s.trim();
        if (t.isEmpty() || t.contains(" ")) return false;
        String low = t.toLowerCase();
        if (low.startsWith("http://") || low.startsWith("https://") || low.startsWith("file:")
                || low.startsWith("about:") || low.startsWith("data:")) {
            return true;
        }
        if (low.startsWith("localhost")) return true;
        return low.matches("^[a-z0-9-]+(\\.[a-z0-9-]+)+(\\:[0-9]+)?(/.*)?$");
    }

    private static boolean isHome(String url) {
        if (url == null) return true;
        return url.startsWith(HOME_URL) || url.equals("about:home") || url.equals("about:blank");
    }

    private boolean handleUrl(String url) {
        if (url == null) return false;
        if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file:")
                || url.startsWith("about:")) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // ── Обновление интерфейса ───────────────────────────────────────────────

    private void updateOmnibox() {
        Tab t = activeTab();
        if (t == null) {
            omnibox.setText("");
            return;
        }
        if (!omnibox.hasFocus()) omnibox.setText(t.isHome || isHome(t.url) ? "" : t.url);
    }

    private void updateOmniboxIcon() {
        Tab t = activeTab();
        if (t != null && t.icon != null && !t.isHome) {
            omniboxIcon.setImageTintList(null);
            omniboxIcon.setImageBitmap(t.icon);
            omniboxIcon.setPadding(dp(6), dp(6), dp(6), dp(6));
        } else {
            omniboxIcon.setImageResource(R.drawable.ic_search);
            omniboxIcon.setImageTintList(ColorStateList.valueOf(Ui.onSurfaceVariant(this)));
            omniboxIcon.setPadding(dp(8), dp(8), dp(8), dp(8));
        }
    }

    private void updateNav() {
        Tab t = activeTab();
        boolean canBack = t != null && t.wv.canGoBack();
        boolean canForward = t != null && t.wv.canGoForward();
        backBtn.setEnabled(canBack);
        forwardBtn.setEnabled(canForward);
    }

    private void updateStar() {
        Tab t = activeTab();
        boolean marked = t != null && !t.isHome && store.isBookmarked(t.url);
        starBtn.setIconResource(marked ? R.drawable.ic_star_filled : R.drawable.ic_star);
        starBtn.setIconTint(ColorStateList.valueOf(
                marked ? Ui.primary(this) : Ui.onSurfaceVariant(this)));
    }

    private void updateReloadButton() {
        Tab t = activeTab();
        boolean loading = t != null && t.loading;
        reloadBtn.setIconResource(loading ? R.drawable.ic_close : R.drawable.ic_reload);
    }

    private void updateTabsBadge() {
        tabsBadge.setText(tabs.size() > 99 ? "99+" : String.valueOf(tabs.size()));
        tabsBadge.setVisibility(tabs.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private void updateIncognitoChip() {
        Tab t = activeTab();
        boolean incognito = t != null && t.incognito;
        incognitoChip.setVisibility(incognito ? View.VISIBLE : View.GONE);
    }

    private void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null && getCurrentFocus() != null) {
            imm.hideSoftInputFromWindow(getCurrentFocus().getWindowToken(), 0);
        }
    }

    private void snack(String text) {
        View root = findViewById(R.id.root);
        if (root == null) return;
        com.google.android.material.snackbar.Snackbar.make(root, text,
                com.google.android.material.snackbar.Snackbar.LENGTH_SHORT).show();
    }

    private String errorPage(String description, String failingUrl) {
        String d = description == null ? "" : description.replace("&", "&amp;").replace("<", "&lt;");
        String u = failingUrl == null ? "" : failingUrl.replace("&", "&amp;").replace("<", "&lt;");
        String bg = hex(Ui.col(this, com.google.android.material.R.attr.colorSurface));
        String fg = hex(Ui.col(this, com.google.android.material.R.attr.colorOnSurface));
        String dim = hex(Ui.col(this, com.google.android.material.R.attr.colorOnSurfaceVariant));
        return "<!doctype html><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                + "<body style=\"background:" + bg + ";color:" + fg + ";"
                + "font-family:sans-serif;text-align:center;padding:64px 24px\">"
                + "<h2>Не удалось открыть страницу</h2>"
                + "<p style=\"color:" + dim + "\">" + d + "</p>"
                + "<p style=\"color:" + dim + ";font-size:13px;opacity:.7\">" + u + "</p></body>";
    }

    // ── Закладки / меню ─────────────────────────────────────────────────────

    private void toggleBookmark() {
        Tab t = activeTab();
        if (t == null || t.isHome || t.url == null || t.url.isEmpty() || isHome(t.url)) {
            snack("Сначала откройте страницу");
            return;
        }
        if (store.isBookmarked(t.url)) {
            store.removeBookmark(t.url);
            snack("Удалено из закладок");
        } else {
            store.addBookmark(t.title, t.url, tabFavicon(t));
            snack("Добавлено в закладки");
        }
        updateStar();
    }

    private String tabFavicon(Tab t) {
        String host = Store.hostOf(t.url);
        return host == null ? "" : "https://www.google.com/s2/favicons?sz=64&domain=" + host;
    }

    private void sharePage() {
        Tab t = activeTab();
        if (t == null || t.url == null || t.isHome) return;
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, t.url);
        startActivity(Intent.createChooser(i, "Поделиться ссылкой"));
    }

    private void toggleDesktop() {
        boolean v = !prefs.desktopUa();
        prefs.setDesktopUa(v);
        for (Tab t : tabs) {
            t.wv.getSettings().setUserAgentString(v ? DESKTOP_UA : null);
            t.wv.reload();
        }
        snack(v ? "Версия для ПК" : "Мобильная версия");
    }

    // ── Шторка вкладок ──────────────────────────────────────────────────────

    private void showTabSwitcher() {
        final com.google.android.material.bottomsheet.BottomSheetDialog sheet =
                new com.google.android.material.bottomsheet.BottomSheetDialog(this);
        sheet.getBehavior().setSkipCollapsed(true);

        LinearLayout root = Ui.vertical(this);
        root.setBackgroundColor(Ui.col(this, com.google.android.material.R.attr.colorSurface));
        int screenH = getResources().getDisplayMetrics().heightPixels;
        root.setMinimumHeight((int) (screenH * 0.92f));

        LinearLayout bar = Ui.horizontal(this);
        bar.setPadding(dp(20), dp(14), dp(8), dp(4));
        com.google.android.material.textview.MaterialTextView title =
                new com.google.android.material.textview.MaterialTextView(this);
        title.setText("Вкладки");
        title.setTextSize(22);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(Ui.onSurface(this));
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        com.google.android.material.button.MaterialButton closeAll =
                Ui.iconButton(this, R.drawable.ic_delete, "Закрыть все вкладки", v -> {
                    sheet.dismiss();
                    closeAllTabs();
                });
        bar.addView(closeAll);
        root.addView(bar);

        android.widget.TextView count = new android.widget.TextView(this);
        count.setText(tabs.size() + " " + plural(tabs.size(), "вкладка", "вкладки", "вкладок"));
        count.setTextColor(Ui.onSurfaceVariant(this));
        count.setTextSize(13);
        count.setPadding(dp(20), 0, dp(20), dp(10));
        root.addView(count);

        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        scroll.setClipToPadding(false);
        android.widget.GridLayout grid = new android.widget.GridLayout(this);
        grid.setColumnCount(2);
        grid.setAlignmentMode(android.widget.GridLayout.ALIGN_BOUNDS);
        grid.setPadding(dp(10), 0, dp(10), dp(16));

        for (int i = 0; i < tabs.size(); i++) {
            final int index = i;
            final Tab t = tabs.get(i);
            com.google.android.material.card.MaterialCardView card = tabCard(t, t == activeTab());
            card.setOnClickListener(v -> {
                setActive(index);
                sheet.dismiss();
            });
            android.widget.GridLayout.LayoutParams lp = new android.widget.GridLayout.LayoutParams();
            lp.width = 0;
            lp.height = dp(148);
            lp.columnSpec = android.widget.GridLayout.spec(android.widget.GridLayout.UNDEFINED, 1f);
            lp.setMargins(dp(6), dp(6), dp(6), dp(6));
            grid.addView(card, lp);
        }
        scroll.addView(grid);
        root.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout actions = Ui.horizontal(this);
        actions.setPadding(dp(16), dp(6), dp(16), dp(16));
        com.google.android.material.button.MaterialButton newTabBtn =
                Ui.tonalButton(this, "Новая вкладка", v -> {
                    sheet.dismiss();
                    newTab(null, false, true);
                });
        newTabBtn.setIconResource(R.drawable.ic_add);
        newTabBtn.setIconGravity(com.google.android.material.button.MaterialButton.ICON_GRAVITY_TEXT_START);
        newTabBtn.setAllCaps(false);
        newTabBtn.setInsetTop(dp(12));
        newTabBtn.setInsetBottom(dp(12));
        actions.addView(newTabBtn, new LinearLayout.LayoutParams(0, dp(52), 1f));
        com.google.android.material.button.MaterialButton incognitoBtn =
                Ui.iconButton(this, R.drawable.ic_incognito, "Новая вкладка инкогнито", v -> {
                    sheet.dismiss();
                    newTab(null, true, true);
                });
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(dp(52), dp(52));
        ilp.setMarginStart(dp(10));
        incognitoBtn.setLayoutParams(ilp);
        actions.addView(incognitoBtn);
        root.addView(actions);

        sheet.setContentView(root);
        sheet.setOnShowListener(d -> {
            var behavior = sheet.getBehavior();
            behavior.setSkipCollapsed(true);
            behavior.setState(com.google.android.material.bottomsheet.BottomSheetBehavior.STATE_EXPANDED);
        });
        sheet.show();
    }

    /** Карточка вкладки для сетки переключателя (как в Chrome). */
    private com.google.android.material.card.MaterialCardView tabCard(final Tab t, boolean isActive) {
        com.google.android.material.card.MaterialCardView card =
                new com.google.android.material.card.MaterialCardView(this);
        card.setRadius(dp(18));
        card.setCardElevation(0f);
        card.setCardBackgroundColor(isActive
                ? Ui.col(this, com.google.android.material.R.attr.colorSecondaryContainer)
                : Ui.surfaceContainerHigh(this));
        if (isActive) {
            card.setStrokeWidth(dp(1.5f));
            card.setStrokeColor(Ui.primary(this));
        } else {
            card.setStrokeWidth(0);
        }
        card.setClipToOutline(true);

        LinearLayout inner = Ui.vertical(this);
        inner.setPadding(dp(12), dp(10), dp(8), dp(12));

        LinearLayout top = Ui.horizontal(this);
        android.widget.ImageView ic = new android.widget.ImageView(this);
        if (t.icon != null) {
            ic.setImageBitmap(t.icon);
        } else {
            ic.setImageResource(t.incognito ? R.drawable.ic_incognito : R.drawable.ic_globe);
            ic.setImageTintList(ColorStateList.valueOf(
                    isActive ? Ui.col(this, com.google.android.material.R.attr.colorOnSecondaryContainer)
                            : Ui.onSurfaceVariant(this)));
        }
        LinearLayout.LayoutParams icLp = new LinearLayout.LayoutParams(dp(20), dp(20));
        icLp.setMarginEnd(dp(8));
        top.addView(ic, icLp);

        com.google.android.material.textview.MaterialTextView tt =
                new com.google.android.material.textview.MaterialTextView(this);
        String name = (t.title == null || t.title.isEmpty())
                ? (isHome(t.url) ? "Новая вкладка" : t.url)
                : t.title;
        tt.setText(name);
        tt.setTextSize(14);
        tt.setTextColor(isActive
                ? Ui.col(this, com.google.android.material.R.attr.colorOnSecondaryContainer)
                : Ui.onSurface(this));
        tt.setSingleLine(true);
        tt.setEllipsize(TextUtils.TruncateAt.END);
        top.addView(tt, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        com.google.android.material.button.MaterialButton close =
                new com.google.android.material.button.MaterialButton(this, null,
                        com.google.android.material.R.attr.materialIconButtonStyle);
        close.setIconResource(R.drawable.ic_close);
        close.setIconGravity(com.google.android.material.button.MaterialButton.ICON_GRAVITY_TEXT_START);
        close.setIconPadding(0);
        close.setIconSize(dp(18));
        close.setInsetTop(0);
        close.setInsetBottom(0);
        close.setIconTint(Ui.navTint(this));
        close.setContentDescription("Закрыть вкладку");
        close.setLayoutParams(new LinearLayout.LayoutParams(dp(34), dp(34)));
        close.setOnClickListener(v -> {
            closeTab(tabs.indexOf(t));
            if (!isFinishing()) {
                showTabSwitcher();
            }
        });
        top.addView(close);
        inner.addView(top);

        View spacer = new View(this);
        inner.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1f));

        com.google.android.material.textview.MaterialTextView sub =
                new com.google.android.material.textview.MaterialTextView(this);
        sub.setText(t.incognito ? "Инкогнито" : (isHome(t.url) ? "Домашняя страница" : t.url));
        sub.setTextSize(11.5f);
        sub.setTextColor(isActive
                ? Ui.withAlpha(Ui.col(this, com.google.android.material.R.attr.colorOnSecondaryContainer), 0.8f)
                : Ui.onSurfaceVariant(this));
        sub.setSingleLine(true);
        sub.setEllipsize(TextUtils.TruncateAt.END);
        inner.addView(sub);

        card.addView(inner, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return card;
    }

    private static String plural(int n, String one, String few, String many) {
        int mod10 = n % 10;
        int mod100 = n % 100;
        if (mod10 == 1 && mod100 != 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
        return many;
    }

    // ── Меню ────────────────────────────────────────────────────────────────

    private void showMenuSheet() {
        final com.google.android.material.bottomsheet.BottomSheetDialog sheet =
                new com.google.android.material.bottomsheet.BottomSheetDialog(this);
        LinearLayout box = Ui.vertical(this);
        box.setPadding(0, dp(8), 0, dp(16));

        addSheetItem(box, R.drawable.ic_add, "Новая вкладка", () -> {
            sheet.dismiss();
            newTab(null, false, true);
        });
        addSheetItem(box, R.drawable.ic_incognito, "Новая вкладка инкогнито", () -> {
            sheet.dismiss();
            newTab(null, true, true);
        });
        box.addView(Ui.divider(this));

        addSheetItem(box, R.drawable.ic_reload, "Обновить страницу", () -> {
            sheet.dismiss();
            Tab t = activeTab();
            if (t != null) t.wv.reload();
        });
        addSheetItem(box, R.drawable.ic_home, "Домашняя страница", () -> {
            sheet.dismiss();
            Tab t = activeTab();
            if (t != null) loadHome(t);
        });
        final Tab t0 = activeTab();
        final boolean hasPage = t0 != null && !t0.isHome && !isHome(t0.url) && t0.url != null;
        boolean marked = hasPage && store.isBookmarked(t0.url);
        addSheetItem(box, marked ? R.drawable.ic_star_filled : R.drawable.ic_star,
                marked ? "Убрать из закладок" : "Добавить в закладки", () -> {
                    sheet.dismiss();
                    toggleBookmark();
                });
        addSheetItem(box, R.drawable.ic_copy, "Копировать ссылку", () -> {
            sheet.dismiss();
            if (hasPage) copyToClipboard("Ссылка", t0.url);
            else snack("Сначала откройте страницу");
        });
        addSheetItem(box, R.drawable.ic_share, "Поделиться", () -> {
            sheet.dismiss();
            sharePage();
        });
        addSheetItem(box, R.drawable.ic_add_to_home, "Добавить на главный экран", () -> {
            sheet.dismiss();
            addToHomeScreen();
        });
        addSheetItem(box, R.drawable.ic_find, "Найти на странице", () -> {
            sheet.dismiss();
            showFindDialog();
        });
        boolean desktop = prefs.desktopUa();
        addSheetItem(box, R.drawable.ic_desktop,
                desktop ? "Мобильная версия сайта" : "Версия для ПК", () -> {
                    sheet.dismiss();
                    toggleDesktop();
                });
        box.addView(Ui.divider(this));

        addSheetItem(box, R.drawable.ic_bookmarks, "Закладки", () -> {
            sheet.dismiss();
            showListSheet("Закладки", store.bookmarks(), true);
        });
        addSheetItem(box, R.drawable.ic_history, "История", () -> {
            sheet.dismiss();
            showListSheet("История", store.history(), false);
        });
        addSheetItem(box, R.drawable.ic_download, "Загрузки", () -> {
            sheet.dismiss();
            showDownloads();
        });
        box.addView(Ui.divider(this));
        addSheetItem(box, R.drawable.ic_settings, "Настройки", () -> {
            sheet.dismiss();
            startActivity(new Intent(this, SettingsActivity.class));
        });
        addSheetItem(box, R.drawable.ic_palette, "Первоначальная настройка", () -> {
            sheet.dismiss();
            startActivity(new Intent(this, OnboardingActivity.class));
        });
        addSheetItem(box, R.drawable.ic_info, "О браузере", () -> {
            sheet.dismiss();
            showAbout();
        });

        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        scroll.addView(box);
        sheet.setContentView(scroll);
        sheet.show();
    }

    private void addSheetItem(LinearLayout parent, int icon, String label, final Runnable action) {
        LinearLayout row = Ui.horizontal(this);
        row.setMinimumHeight(dp(52));
        row.setPadding(dp(22), dp(12), dp(22), dp(12));
        Ui.ripple(this, row);
        row.setClickable(true);
        row.setFocusable(true);

        android.widget.ImageView ic = new android.widget.ImageView(this);
        ic.setImageResource(icon);
        ic.setImageTintList(ColorStateList.valueOf(Ui.onSurfaceVariant(this)));
        LinearLayout.LayoutParams icLp = new LinearLayout.LayoutParams(dp(24), dp(24));
        icLp.setMarginEnd(dp(18));
        row.addView(ic, icLp);

        com.google.android.material.textview.MaterialTextView t =
                new com.google.android.material.textview.MaterialTextView(this);
        t.setText(label);
        t.setTextSize(15);
        t.setTextColor(Ui.onSurface(this));
        row.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        row.setOnClickListener(v -> action.run());
        parent.addView(row);
    }

    private void showListSheet(String title, java.util.List<Store.Item> items, boolean removable) {
        final com.google.android.material.bottomsheet.BottomSheetDialog sheet =
                new com.google.android.material.bottomsheet.BottomSheetDialog(this);
        LinearLayout box = Ui.vertical(this);
        box.setPadding(dp(16), dp(8), dp(16), dp(20));

        com.google.android.material.textview.MaterialTextView header =
                new com.google.android.material.textview.MaterialTextView(this);
        header.setText(title);
        header.setTextSize(20);
        header.setTypeface(Typeface.DEFAULT_BOLD);
        header.setTextColor(Ui.onSurface(this));
        header.setPadding(0, 0, 0, dp(8));
        box.addView(header);

        if (items.isEmpty()) {
            com.google.android.material.textview.MaterialTextView empty =
                    new com.google.android.material.textview.MaterialTextView(this);
            empty.setText("Пусто");
            empty.setTextColor(Ui.onSurfaceVariant(this));
            empty.setPadding(0, dp(24), 0, dp(24));
            box.addView(empty);
        }

        for (final Store.Item it : items) {
            LinearLayout row = Ui.horizontal(this);
            row.setMinimumHeight(dp(56));
            row.setPadding(dp(8), dp(8), dp(8), dp(8));
            Ui.ripple(this, row);
            row.setClickable(true);

            LinearLayout col = Ui.vertical(this);
            com.google.android.material.textview.MaterialTextView name =
                    new com.google.android.material.textview.MaterialTextView(this);
            name.setText(it.title == null || it.title.isEmpty() ? it.url : it.title);
            name.setTextSize(15);
            name.setTextColor(Ui.onSurface(this));
            name.setSingleLine(true);
            name.setEllipsize(TextUtils.TruncateAt.END);
            com.google.android.material.textview.MaterialTextView sub =
                    new com.google.android.material.textview.MaterialTextView(this);
            sub.setText(it.url);
            sub.setTextSize(12);
            sub.setTextColor(Ui.onSurfaceVariant(this));
            sub.setSingleLine(true);
            sub.setEllipsize(TextUtils.TruncateAt.END);
            col.addView(name);
            col.addView(sub);
            row.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

            if (removable) {
                com.google.android.material.button.MaterialButton del =
                        Ui.iconButton(this, R.drawable.ic_close, "Удалить", v -> {
                            store.removeBookmark(it.url);
                            sheet.dismiss();
                            if (!isFinishing()) showListSheet(title, store.bookmarks(), true);
                        });
                row.addView(del);
            }

            row.setOnClickListener(v -> {
                sheet.dismiss();
                navigate(it.url);
            });
            box.addView(row);
            box.addView(Ui.divider(this));
        }

        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        scroll.addView(box);
        sheet.setContentView(scroll);
        sheet.show();
    }

    // ── Контекстное меню ссылки / картинки ──────────────────────────────────

    private void showLinkMenu(final String url) {
        final com.google.android.material.bottomsheet.BottomSheetDialog sheet =
                new com.google.android.material.bottomsheet.BottomSheetDialog(this);
        LinearLayout box = Ui.vertical(this);
        box.setPadding(0, dp(6), 0, dp(12));

        com.google.android.material.textview.MaterialTextView head =
                new com.google.android.material.textview.MaterialTextView(this);
        String host = Store.hostOf(url);
        head.setText(host == null ? url : host);
        head.setTextSize(13);
        head.setTextColor(Ui.onSurfaceVariant(this));
        head.setSingleLine(true);
        head.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        head.setPadding(dp(22), dp(10), dp(22), dp(6));
        box.addView(head);

        addSheetItem(box, R.drawable.ic_open_in_new, "Открыть в новой вкладке", () -> {
            sheet.dismiss();
            newTab(url, false, true);
        });
        addSheetItem(box, R.drawable.ic_tab, "Открыть в фоне", () -> {
            sheet.dismiss();
            newTab(url, false, false);
            snack("Открыто в фоне");
        });
        addSheetItem(box, R.drawable.ic_incognito, "Открыть в инкогнито", () -> {
            sheet.dismiss();
            newTab(url, true, true);
        });
        box.addView(Ui.divider(this));
        addSheetItem(box, R.drawable.ic_copy, "Копировать ссылку", () -> {
            sheet.dismiss();
            copyToClipboard("Ссылка", url);
        });
        addSheetItem(box, R.drawable.ic_share, "Поделиться ссылкой", () -> {
            sheet.dismiss();
            shareUrl(url);
        });

        sheet.setContentView(box);
        sheet.show();
    }

    private void showImageMenu(final String url) {
        final com.google.android.material.bottomsheet.BottomSheetDialog sheet =
                new com.google.android.material.bottomsheet.BottomSheetDialog(this);
        LinearLayout box = Ui.vertical(this);
        box.setPadding(0, dp(10), 0, dp(12));
        addSheetItem(box, R.drawable.ic_image, "Открыть изображение", () -> {
            sheet.dismiss();
            newTab(url, false, true);
        });
        addSheetItem(box, R.drawable.ic_save, "Сохранить изображение", () -> {
            sheet.dismiss();
            enqueueDownload(url, null, null);
        });
        addSheetItem(box, R.drawable.ic_copy, "Копировать адрес изображения", () -> {
            sheet.dismiss();
            copyToClipboard("Адрес изображения", url);
        });
        sheet.setContentView(box);
        sheet.show();
    }

    private void copyToClipboard(String label, String text) {
        android.content.ClipboardManager cm =
                (android.content.ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm != null) {
            cm.setPrimaryClip(android.content.ClipData.newPlainText(label, text));
            snack("Скопировано");
        }
    }

    private void shareUrl(String url) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, url);
        startActivity(Intent.createChooser(i, "Поделиться ссылкой"));
    }

    // ── Загрузки ────────────────────────────────────────────────────────────

    private void enqueueDownload(String url, String contentDisposition, String mimetype) {
        enqueueDownload(url, contentDisposition, mimetype, false);
    }

    private void enqueueDownload(String url, String contentDisposition, String mimetype, boolean incognito) {
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
            snack("Не удалось начать загрузку");
            return;
        }
        try {
            String name = URLUtil.guessFileName(url, contentDisposition, mimetype);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle(name);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            if (!incognito) {
                String cookie = android.webkit.CookieManager.getInstance().getCookie(url);
                if (cookie != null) req.addRequestHeader("Cookie", cookie);
            } else {
                // В инкогнито не передаём cookies
            }
            Tab t = activeTab();
            if (t != null) {
                String ua = t.wv.getSettings().getUserAgentString();
                if (ua != null) req.addRequestHeader("User-Agent", ua);
            }
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(req);
                snack("Загрузка: " + name);
            }
        } catch (Exception e) {
            snack("Не удалось начать загрузку");
        }
    }

    private void showDownloads() {
        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        final ArrayList<Long> ids = new ArrayList<>();
        final ArrayList<String> names = new ArrayList<>();
        final ArrayList<String> meta = new ArrayList<>();
        if (dm != null) {
            android.database.Cursor c = null;
            try {
                c = dm.query(new DownloadManager.Query());
                while (c != null && c.moveToNext()) {
                    long id = c.getLong(c.getColumnIndex(DownloadManager.COLUMN_ID));
                    String title = c.getString(c.getColumnIndex(DownloadManager.COLUMN_TITLE));
                    int status = c.getInt(c.getColumnIndex(DownloadManager.COLUMN_STATUS));
                    long done = c.getLong(c.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = c.getLong(c.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    ids.add(id);
                    names.add(title == null || title.isEmpty() ? "Файл" : title);
                    meta.add(downloadState(status, done, total));
                }
            } catch (Exception ignored) {
            } finally {
                if (c != null) c.close();
            }
        }

        final com.google.android.material.bottomsheet.BottomSheetDialog sheet =
                new com.google.android.material.bottomsheet.BottomSheetDialog(this);
        LinearLayout box = Ui.vertical(this);
        box.setPadding(dp(16), dp(8), dp(16), dp(20));
        com.google.android.material.textview.MaterialTextView title =
                new com.google.android.material.textview.MaterialTextView(this);
        title.setText("Загрузки");
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(Ui.onSurface(this));
        title.setPadding(0, 0, 0, dp(8));
        box.addView(title);

        if (ids.isEmpty()) {
            com.google.android.material.textview.MaterialTextView empty =
                    new com.google.android.material.textview.MaterialTextView(this);
            empty.setText("Пока нет загрузок");
            empty.setTextColor(Ui.onSurfaceVariant(this));
            empty.setPadding(0, dp(20), 0, dp(20));
            box.addView(empty);
        }

        for (int i = 0; i < ids.size(); i++) {
            final long id = ids.get(i);
            LinearLayout row = Ui.horizontal(this);
            row.setMinimumHeight(dp(56));
            row.setPadding(dp(4), dp(8), dp(4), dp(8));
            Ui.ripple(this, row);
            row.setClickable(true);

            android.widget.ImageView ic = new android.widget.ImageView(this);
            ic.setImageResource(R.drawable.ic_download);
            ic.setImageTintList(ColorStateList.valueOf(Ui.onSurfaceVariant(this)));
            LinearLayout.LayoutParams icLp = new LinearLayout.LayoutParams(dp(22), dp(22));
            icLp.setMarginEnd(dp(14));
            row.addView(ic, icLp);

            LinearLayout col = Ui.vertical(this);
            com.google.android.material.textview.MaterialTextView nm =
                    new com.google.android.material.textview.MaterialTextView(this);
            nm.setText(names.get(i));
            nm.setTextSize(15);
            nm.setTextColor(Ui.onSurface(this));
            nm.setSingleLine(true);
            nm.setEllipsize(TextUtils.TruncateAt.MIDDLE);
            com.google.android.material.textview.MaterialTextView st =
                    new com.google.android.material.textview.MaterialTextView(this);
            st.setText(meta.get(i));
            st.setTextSize(12);
            st.setTextColor(Ui.onSurfaceVariant(this));
            col.addView(nm);
            col.addView(st);
            row.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

            com.google.android.material.button.MaterialButton del =
                    Ui.iconButton(this, R.drawable.ic_delete, "Удалить", v -> {
                        DownloadManager m = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                        if (m != null) m.remove(id);
                        sheet.dismiss();
                        showDownloads();
                    });
            row.addView(del);

            row.setOnClickListener(v -> {
                openDownload(id);
                sheet.dismiss();
            });
            box.addView(row);
            box.addView(Ui.divider(this));
        }

        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        scroll.addView(box);
        sheet.setContentView(scroll);
        sheet.show();
    }

    private void openDownload(long id) {
        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) return;
        Uri uri = dm.getUriForDownloadedFile(id);
        if (uri == null) {
            snack("Файл ещё не готов");
            return;
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/octet-stream");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            snack("Нет приложения для этого файла");
        }
    }

    private static String downloadState(int status, long done, long total) {
        switch (status) {
            case DownloadManager.STATUS_SUCCESSFUL:
                return "Загружено";
            case DownloadManager.STATUS_FAILED:
                return "Ошибка";
            case DownloadManager.STATUS_PAUSED:
                return "Приостановлено";
            case DownloadManager.STATUS_PENDING:
                return "В очереди";
            case DownloadManager.STATUS_RUNNING:
                if (total > 0) return "Загрузка " + (done * 100 / total) + "%";
                return "Загрузка…";
            default:
                return "";
        }
    }

    // ── Ярлык на главном экране ─────────────────────────────────────────────

    @SuppressLint("NewApi")
    private void addToHomeScreen() {
        Tab t = activeTab();
        if (t == null || t.url == null || t.url.isEmpty() || t.isHome || isHome(t.url)) {
            snack("Сначала откройте страницу");
            return;
        }
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) {
            snack("Недоступно на этой версии Android");
            return;
        }
        try {
            android.content.pm.ShortcutManager sm =
                    (android.content.pm.ShortcutManager) getSystemService(Context.SHORTCUT_SERVICE);
            if (sm == null || !sm.isRequestPinShortcutSupported()) {
                snack("Лаунчер не поддерживает ярлыки");
                return;
            }
            String label = (t.title == null || t.title.isEmpty()) ? Store.hostOf(t.url) : t.title;
            if (label == null || label.isEmpty()) label = "Сайт";
            android.content.pm.ShortcutInfo shortcut = new android.content.pm.ShortcutInfo.Builder(this,
                    "site_" + Math.abs(t.url.hashCode()))
                    .setShortLabel(label.length() > 24 ? label.substring(0, 24) : label)
                    .setLongLabel(label)
                    .setIcon(android.graphics.drawable.Icon.createWithResource(this, R.mipmap.ic_launcher))
                    .setIntent(new Intent(Intent.ACTION_VIEW, Uri.parse(t.url)).setPackage(getPackageName()))
                    .build();
            sm.requestPinShortcut(shortcut, null);
            snack("Ярлык добавлен на главный экран");
        } catch (Exception e) {
            snack("Не удалось создать ярлык");
        }
    }

    // ── Поиск на странице ───────────────────────────────────────────────────

    private void showFindDialog() {
        final Tab t = activeTab();
        if (t == null) return;
        final EditText input = new EditText(this);
        input.setHint("Текст для поиска");
        input.setSingleLine(true);
        t.wv.setFindListener((ordinal, count, done) -> {
            if (done && count == 0) snack("Совпадений нет");
        });
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle("Найти на странице")
                .setView(input)
                .setPositiveButton("Найти", (d, w) -> t.wv.findAllAsync(input.getText().toString()))
                .setNeutralButton("Далее", (d, w) -> {
                    t.wv.findAllAsync(input.getText().toString());
                    t.wv.findNext(true);
                })
                .setNegativeButton("Закрыть", (d, w) -> t.wv.clearMatches())
                .show();
    }

    // ── О браузере ──────────────────────────────────────────────────────────

    private void showAbout() {
        LinearLayout box = Ui.vertical(this);
        box.setPadding(dp(24), dp(8), dp(24), dp(8));
        box.setGravity(android.view.Gravity.CENTER_HORIZONTAL);

        android.widget.ImageView logo = new android.widget.ImageView(this);
        logo.setImageResource(R.drawable.ic_logo);
        box.addView(logo, new LinearLayout.LayoutParams(dp(72), dp(72)));

        com.google.android.material.textview.MaterialTextView name =
                new com.google.android.material.textview.MaterialTextView(this);
        name.setText("MokomailBrowser");
        name.setTextSize(20);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        name.setTextColor(Ui.onSurface(this));
        name.setPadding(0, dp(12), 0, 0);
        box.addView(name);

        String version = "1.0";
        try {
            version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception ignored) {}
        com.google.android.material.textview.MaterialTextView sub =
                new com.google.android.material.textview.MaterialTextView(this);
        sub.setText("Версия " + version + " • команда MokomailTeam");
        sub.setTextColor(Ui.onSurfaceVariant(this));
        box.addView(sub);

        LinearLayout links = Ui.vertical(this);
        links.setPadding(0, dp(14), 0, 0);
        links.addView(Ui.actionRow(this, R.drawable.ic_globe, "TikTok — @mokomail",
                () -> openLink("https://www.tiktok.com/@mokomail")));
        links.addView(Ui.actionRow(this, R.drawable.ic_globe, "GitHub — mokomail",
                () -> openLink("https://github.com/mokomail")));
        box.addView(links);

        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle("О браузере")
                .setView(box)
                .setPositiveButton("Закрыть", null)
                .show();
    }

    private void openLink(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {}
    }

    private int dp(float v) {
        return Ui.dp(this, v);
    }
}
