package com.mokomail.browser;

import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.widget.NestedScrollView;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.materialswitch.MaterialSwitch;
import com.google.android.material.progressindicator.LinearProgressIndicator;
import com.google.android.material.textfield.TextInputEditText;
import com.google.android.material.textfield.TextInputLayout;
import com.google.android.material.textview.MaterialTextView;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Первоначальная настройка — пятишаговый мастер, как в Windows-версии:
 * приветствие, поисковая система, оформление, приватность и итог.
 * Все изменения сохраняются сразу, поэтому мастер можно пропустить в любой
 * момент, а потом открыть заново из настроек или меню.
 */
public class OnboardingActivity extends AppCompatActivity {

    private static final int STEPS = 5;
    private static final String STATE_STEP = "onboarding_step";

    private static final Map<String, String> ENGINE_NOTES = new HashMap<>();
    static {
        ENGINE_NOTES.put("google", "Самая популярная");
        ENGINE_NOTES.put("yandex", "Удобно для русскоязычных");
        ENGINE_NOTES.put("duckduckgo", "Приватность по умолчанию");
        ENGINE_NOTES.put("bing", "Поиск от Microsoft");
        ENGINE_NOTES.put("mail", "Почта и поиск Mail.ru");
        ENGINE_NOTES.put("wikipedia", "Свободная энциклопедия");
        ENGINE_NOTES.put("custom", "Свой адрес поиска");
    }

    private static class EngineCard {
        final String id;
        final MaterialCardView card;
        final MaterialTextView name;
        final MaterialTextView sub;
        final MaterialTextView avatar;
        final ImageView check;

        EngineCard(String id, MaterialCardView card, MaterialTextView name,
                   MaterialTextView sub, MaterialTextView avatar, ImageView check) {
            this.id = id;
            this.card = card;
            this.name = name;
            this.sub = sub;
            this.avatar = avatar;
            this.check = check;
        }
    }

    private Prefs prefs;
    private int step;
    private int stepOverride = -1;
    private boolean accentDirty;

    private MaterialTextView stepLabel;
    private LinearProgressIndicator progress;
    private NestedScrollView scroll;
    private LinearLayout body;
    private LinearLayout dots;
    private MaterialButton back;
    private MaterialButton next;

    private final List<EngineCard> engineCards = new ArrayList<>();
    private LinearLayout customBox;
    private View previewCard;
    private LinearLayout swatchContainer;
    private MaterialSwitch dynamicSwitch;
    private MaterialTextView accentHint;
    private boolean suppressDynamic;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = new Prefs(this);
        step = savedInstanceState == null ? 0 : savedInstanceState.getInt(STATE_STEP, 0);
        stepOverride = -1;
        if (step < 0 || step >= STEPS) step = 0;

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        buildShell();
        renderStep();
    }

    // ── Каркас ──────────────────────────────────────────────────────────────

    private void buildShell() {
        LinearLayout root = Ui.vertical(this);
        root.setBackgroundColor(Ui.col(this, com.google.android.material.R.attr.colorSurface));

        final LinearLayout top = Ui.horizontal(this);
        top.setPadding(dp(22), dp(6), dp(10), 0);
        stepLabel = new MaterialTextView(this);
        stepLabel.setTextSize(13);
        stepLabel.setTextColor(Ui.onSurfaceVariant(this));
        top.addView(stepLabel, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        MaterialButton skip = Ui.textButton(this, "Пропустить", v -> finishOnboarding());
        top.addView(skip);
        root.addView(top);

        LinearLayout progressWrap = Ui.vertical(this);
        progressWrap.setPadding(dp(22), dp(2), dp(22), 0);
        progress = new LinearProgressIndicator(this);
        progress.setMax(100);
        progress.setTrackThickness(dp(4));
        progress.setTrackCornerRadius(dp(2));
        progress.setIndicatorColor(Ui.primary(this));
        progress.setTrackColor(Ui.col(this,
                com.google.android.material.R.attr.colorSurfaceContainerHighest));
        progressWrap.addView(progress, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(4)));
        root.addView(progressWrap);

        scroll = new NestedScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        body = Ui.vertical(this);
        body.setPadding(dp(22), dp(10), dp(22), dp(24));
        scroll.addView(body, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        final LinearLayout footer = Ui.vertical(this);
        footer.setPadding(dp(16), dp(6), dp(16), dp(8));
        dots = Ui.horizontal(this);
        dots.setGravity(Gravity.CENTER);
        footer.addView(dots);

        LinearLayout buttons = Ui.horizontal(this);
        buttons.setPadding(0, dp(10), 0, 0);
        back = Ui.textButton(this, "Назад", v -> goBack());
        back.setTextSize(15);
        buttons.addView(back, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(50)));

        next = new MaterialButton(this);
        next.setText("Далее");
        next.setAllCaps(false);
        next.setTextSize(15);
        next.setInsetTop(0);
        next.setInsetBottom(0);
        next.setIconResource(R.drawable.ic_arrow_forward);
        next.setIconGravity(MaterialButton.ICON_GRAVITY_TEXT_END);
        next.setOnClickListener(v -> goNext());
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(0, dp(50), 1f);
        nlp.setMarginStart(dp(8));
        buttons.addView(next, nlp);
        footer.addView(buttons);
        root.addView(footer);

        setContentView(root);

        WindowInsetsControllerCompat c =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setAppearanceLightStatusBars(!isNight());
        c.setAppearanceLightNavigationBars(!isNight());

        ViewCompat.setOnApplyWindowInsetsListener(top, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(dp(22), bars.top + dp(6), dp(10), 0);
            return insets;
        });
        ViewCompat.setOnApplyWindowInsetsListener(footer, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(dp(16), dp(6), dp(16), bars.bottom + dp(10));
            return insets;
        });
    }

    // ── Навигация по шагам ──────────────────────────────────────────────────

    private void goBack() {
        if (step <= 0) {
            finishOnboarding();
            return;
        }
        step--;
        renderStep();
    }

    private void goNext() {
        if (step >= STEPS - 1) {
            finishOnboarding();
            return;
        }
        if (accentDirty) {
            // Применяем новую палитру, сразу открывая следующий шаг.
            accentDirty = false;
            stepOverride = step + 1;
            recreate();
            return;
        }
        step++;
        renderStep();
    }

    private void finishOnboarding() {
        prefs.setOnboardingDone(true);
        setResult(RESULT_OK);
        finish();
    }

    @Override
    public void onBackPressed() {
        if (step > 0) {
            goBack();
        } else {
            finishOnboarding();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putInt(STATE_STEP, stepOverride >= 0 ? stepOverride : step);
    }

    private void renderStep() {
        engineCards.clear();
        previewCard = null;
        customBox = null;
        swatchContainer = null;
        dynamicSwitch = null;
        accentHint = null;
        body.removeAllViews();
        scroll.scrollTo(0, 0);

        progress.setProgressCompat((step + 1) * 100 / STEPS, true);
        stepLabel.setText("Шаг " + (step + 1) + " из " + STEPS);
        renderDots();
        back.setVisibility(step == 0 ? View.INVISIBLE : View.VISIBLE);
        next.setText(step == STEPS - 1 ? "Начать работу" : "Далее");
        next.setIconResource(step == STEPS - 1 ? R.drawable.ic_check : R.drawable.ic_arrow_forward);

        switch (step) {
            case 0: renderWelcome(); break;
            case 1: renderSearch(); break;
            case 2: renderAppearance(); break;
            case 3: renderPrivacy(); break;
            default: renderSummary(); break;
        }
    }

    private void renderDots() {
        dots.removeAllViews();
        for (int i = 0; i < STEPS; i++) {
            boolean on = i == step;
            View dot = new View(this);
            GradientDrawable g = new GradientDrawable();
            g.setCornerRadius(dp(4));
            g.setColor(on ? Ui.primary(this) : Ui.outlineVariant(this));
            dot.setBackground(g);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    dp(on ? 20 : 6), dp(6));
            lp.setMarginStart(dp(3));
            lp.setMarginEnd(dp(3));
            dots.addView(dot, lp);
        }
    }

    // ── Шаг 1. Приветствие ──────────────────────────────────────────────────

    private void renderWelcome() {
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.ic_logo);
        addCentered(logo, 94, 94, 12);

        MaterialTextView title = new MaterialTextView(this);
        title.setText("Добро пожаловать");
        title.setTextSize(27);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setTextColor(Ui.onSurface(this));
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tlp.topMargin = dp(20);
        body.addView(title, tlp);

        MaterialTextView subtitle = new MaterialTextView(this);
        subtitle.setText("в MokomailBrowser");
        subtitle.setTextSize(17);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setTextColor(Ui.primary(this));
        subtitle.setPadding(0, dp(2), 0, 0);
        body.addView(subtitle);

        body.addView(text("Быстрый браузер на Chromium от команды MokomailTeam. "
                + "Давайте настроим его под вас — это займёт меньше минуты.", true));

        MaterialCardView features = Ui.card(this);
        LinearLayout inner = Ui.vertical(this);
        inner.addView(featureRow(R.drawable.ic_globe, "Chromium внутри",
                "Быстрый движок и современные сайты"));
        inner.addView(Ui.divider(this));
        inner.addView(featureRow(R.drawable.ic_shield, "Приватность по умолчанию",
                "Инкогнито, блокировка pop-up, без слежки"));
        inner.addView(Ui.divider(this));
        inner.addView(featureRow(R.drawable.ic_palette, "Material 3",
                "Светлая, тёмная тема и акцентный цвет"));
        features.addView(inner);
        LinearLayout.LayoutParams flp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        flp.topMargin = dp(20);
        body.addView(features, flp);

        String chipText;
        if (!Accents.isAvailable()) {
            chipText = "Material 3 · классическая палитра";
        } else if (prefs.dynamicColor()) {
            chipText = "Material You · цвета обоев";
        } else {
            chipText = "Акцент: " + Accents.normalize(prefs.accentColor());
        }
        MaterialTextView chip = new MaterialTextView(this);
        chip.setText(chipText);
        chip.setTextSize(12.5f);
        chip.setTextColor(Ui.col(this,
                com.google.android.material.R.attr.colorOnPrimaryContainer));
        chip.setBackgroundColor(Ui.col(this,
                com.google.android.material.R.attr.colorPrimaryContainer));
        chip.setPadding(dp(14), dp(7), dp(14), dp(7));
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clp.gravity = Gravity.CENTER_HORIZONTAL;
        clp.topMargin = dp(16);
        body.addView(chip, clp);
    }

    private View featureRow(int icon, String title, String sub) {
        LinearLayout row = Ui.horizontal(this);
        row.setPadding(dp(14), dp(14), dp(14), dp(14));

        ImageView ic = new ImageView(this);
        ic.setImageResource(icon);
        ic.setImageTintList(ColorStateList.valueOf(
                Ui.col(this, com.google.android.material.R.attr.colorPrimary)));
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(dp(24), dp(24));
        ilp.setMarginEnd(dp(14));
        row.addView(ic, ilp);

        LinearLayout col = Ui.vertical(this);
        MaterialTextView t = new MaterialTextView(this);
        t.setText(title);
        t.setTextSize(14.5f);
        t.setTextColor(Ui.onSurface(this));
        col.addView(t);
        MaterialTextView s = new MaterialTextView(this);
        s.setText(sub);
        s.setTextSize(12);
        s.setTextColor(Ui.onSurfaceVariant(this));
        col.addView(s);
        row.addView(col, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        return row;
    }

    // ── Шаг 2. Поисковая система ────────────────────────────────────────────

    private void renderSearch() {
        header(R.drawable.ic_search, "Чем искать в интернете",
                "Этот сервис откроется, когда вы введёте в адресную строку запрос, а не адрес.");

        String current = prefs.searchEngine();
        if (!Engines.ALL.containsKey(current)) current = "google";

        for (Engines.Engine e : Engines.list()) {
            addEngineCard(e, e.id.equals(current));
        }

        customBox = Ui.vertical(this);
        customBox.setPadding(0, dp(4), 0, 0);
        customBox.setVisibility("custom".equals(current) ? View.VISIBLE : View.GONE);

        TextInputLayout field = new TextInputLayout(this);
        field.setHint("Адрес поиска");
        field.setHelperText("Вставьте %s вместо запроса, например: https://duckduckgo.com/?q=%s");
        field.setBoxBackgroundMode(TextInputLayout.BOX_BACKGROUND_FILLED);
        TextInputEditText input = new TextInputEditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setText(prefs.customSearchUrl());
        field.addView(input, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        input.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) {
                prefs.setCustomSearchUrl(s.toString().trim());
            }
        });
        customBox.addView(field);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clp.topMargin = dp(4);
        body.addView(customBox, clp);

        body.addView(text("Поисковую систему можно поменять позже в «Настройках».", false));
    }

    private void addEngineCard(Engines.Engine e, boolean selected) {
        MaterialCardView card = new MaterialCardView(this);
        card.setRadius(dp(18));
        card.setCardElevation(0f);
        card.setStrokeWidth(dp(1));
        card.setClipToOutline(true);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clp.bottomMargin = dp(8);
        card.setLayoutParams(clp);

        LinearLayout row = Ui.horizontal(this);
        row.setPadding(dp(14), dp(12), dp(14), dp(12));

        MaterialTextView avatar = new MaterialTextView(this);
        avatar.setText(e.name.isEmpty() ? "?" : e.name.substring(0, 1).toUpperCase());
        avatar.setTextSize(16);
        avatar.setGravity(Gravity.CENTER);
        avatar.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Ui.col(this, com.google.android.material.R.attr.colorPrimaryContainer));
        avatar.setBackground(bg);
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(dp(40), dp(40));
        alp.setMarginEnd(dp(14));
        row.addView(avatar, alp);

        LinearLayout col = Ui.vertical(this);
        MaterialTextView name = new MaterialTextView(this);
        name.setText(e.name);
        name.setTextSize(15.5f);
        col.addView(name);
        MaterialTextView sub = new MaterialTextView(this);
        sub.setText(ENGINE_NOTES.containsKey(e.id) ? ENGINE_NOTES.get(e.id) : "Поисковая система");
        sub.setTextSize(12);
        col.addView(sub);
        row.addView(col, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        ImageView check = new ImageView(this);
        check.setImageResource(R.drawable.ic_check);
        row.addView(check, new LinearLayout.LayoutParams(dp(22), dp(22)));

        card.addView(row);
        card.setOnClickListener(v -> selectEngine(e.id));

        EngineCard ec = new EngineCard(e.id, card, name, sub, avatar, check);
        engineCards.add(ec);
        body.addView(card);
        styleEngine(ec, selected);
    }

    private void selectEngine(String id) {
        prefs.setSearchEngine(id);
        String home = Engines.home(id);
        if (home != null && !home.isEmpty()) prefs.setHomepage(home);
        for (EngineCard ec : engineCards) styleEngine(ec, ec.id.equals(id));
        if (customBox != null) {
            customBox.setVisibility("custom".equals(id) ? View.VISIBLE : View.GONE);
        }
    }

    private void styleEngine(EngineCard ec, boolean on) {
        int primaryContainer = Ui.col(this,
                com.google.android.material.R.attr.colorPrimaryContainer);
        int onPrimaryContainer = Ui.col(this,
                com.google.android.material.R.attr.colorOnPrimaryContainer);
        if (on) {
            ec.card.setCardBackgroundColor(primaryContainer);
            ec.card.setStrokeWidth(0);
            ec.name.setTextColor(onPrimaryContainer);
            ec.sub.setTextColor(Ui.withAlpha(onPrimaryContainer, 0.75f));
            ec.avatar.setBackgroundTintList(ColorStateList.valueOf(onPrimaryContainer));
            ec.avatar.setTextColor(primaryContainer);
            ec.check.setImageTintList(ColorStateList.valueOf(onPrimaryContainer));
            ec.check.setVisibility(View.VISIBLE);
        } else {
            ec.card.setCardBackgroundColor(Ui.surfaceContainerHigh(this));
            ec.card.setStrokeWidth(dp(1));
            ec.card.setStrokeColor(Ui.outlineVariant(this));
            ec.name.setTextColor(Ui.onSurface(this));
            ec.sub.setTextColor(Ui.onSurfaceVariant(this));
            ec.avatar.setBackgroundTintList(ColorStateList.valueOf(primaryContainer));
            ec.avatar.setTextColor(onPrimaryContainer);
            ec.check.setImageTintList(null);
            ec.check.setVisibility(View.INVISIBLE);
        }
    }

    // ── Шаг 3. Оформление ───────────────────────────────────────────────────

    private void renderAppearance() {
        header(R.drawable.ic_palette, "Как должно выглядеть",
                "Выберите тему и акцентный цвет. Схема строится по правилам Material 3 и применяется сразу.");

        body.addView(sectionLabel("ТЕМА ОФОРМЛЕНИЯ"));

        String mode = prefs.themeMode();
        LinearLayout themes = Ui.horizontal(this);
        MaterialButton system = themeButton("Системная", "system", mode);
        MaterialButton light = themeButton("Светлая", "light", mode);
        MaterialButton dark = themeButton("Тёмная", "dark", mode);
        LinearLayout.LayoutParams lp1 = new LinearLayout.LayoutParams(0, dp(46), 1f);
        lp1.setMarginEnd(dp(8));
        themes.addView(system, lp1);
        LinearLayout.LayoutParams lp2 = new LinearLayout.LayoutParams(0, dp(46), 1f);
        lp2.setMarginEnd(dp(8));
        themes.addView(light, lp2);
        themes.addView(dark, new LinearLayout.LayoutParams(0, dp(46), 1f));
        body.addView(themes);

        if (Accents.isAvailable()) {
            body.addView(sectionLabel("АКЦЕНТНЫЙ ЦВЕТ"));
            accentHint = text(prefs.dynamicColor()
                    ? "Сейчас палитра берётся из обоев. Выберите цвет, чтобы задать свою."
                    : "Палитра Material 3 строится из выбранного цвета.", false, 12);
            body.addView(accentHint);

            swatchContainer = Ui.vertical(this);
            body.addView(swatchContainer);
            buildSwatches();

            body.addView(gap(14));
            MaterialCardView dynCard = Ui.card(this);
            dynamicSwitch = new MaterialSwitch(this);
            dynamicSwitch.setChecked(prefs.dynamicColor());
            dynamicSwitch.setOnCheckedChangeListener((b, checked) -> {
                if (suppressDynamic) return;
                prefs.setDynamicColor(checked);
                recreate();
            });
            LinearLayout dynRow = Ui.horizontal(this);
            dynRow.setPadding(dp(16), dp(8), dp(12), dp(8));
            LinearLayout dynCol = Ui.vertical(this);
            MaterialTextView dynTitle = new MaterialTextView(this);
            dynTitle.setText("Динамические цвета");
            dynTitle.setTextSize(14.5f);
            dynTitle.setTextColor(Ui.onSurface(this));
            MaterialTextView dynSub = new MaterialTextView(this);
            dynSub.setText("Брать палитру из обоев (Material You)");
            dynSub.setTextSize(12);
            dynSub.setTextColor(Ui.onSurfaceVariant(this));
            dynCol.addView(dynTitle);
            dynCol.addView(dynSub);
            dynRow.addView(dynCol, new LinearLayout.LayoutParams(0,
                    ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            dynRow.addView(dynamicSwitch);
            dynCard.addView(dynRow);
            body.addView(dynCard, matchWrap());
        } else {
            body.addView(text("Акцентные цвета доступны на Android 12 и новее — "
                    + "здесь используется фирменная палитра Mokomail.", false));
        }

        body.addView(sectionLabel("ПРЕДПРОСМОТР"));
        previewCard = buildPreviewCard();
        body.addView(previewCard, matchWrap());
        updatePreview();
    }

    private void buildSwatches() {
        if (swatchContainer == null) return;
        swatchContainer.removeAllViews();
        boolean dynamic = prefs.dynamicColor();
        String current = Accents.normalize(prefs.accentColor());
        int perRow = 5;
        for (int start = 0; start < Accents.ALL.length; start += perRow) {
            LinearLayout row = Ui.horizontal(this);
            row.setGravity(Gravity.CENTER_HORIZONTAL);
            LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            rlp.topMargin = dp(12);
            row.setLayoutParams(rlp);
            for (int i = start; i < Math.min(start + perRow, Accents.ALL.length); i++) {
                final String hex = Accents.ALL[i];
                View sw = Accents.swatch(this, hex, !dynamic && hex.equals(current), () -> {
                    prefs.setAccentColor(hex);
                    prefs.setDynamicColor(false);
                    accentDirty = true;
                    if (dynamicSwitch != null) {
                        suppressDynamic = true;
                        dynamicSwitch.setChecked(false);
                        suppressDynamic = false;
                    }
                    if (accentHint != null) {
                        accentHint.setText("Палитра Material 3 строится из выбранного цвета.");
                    }
                    buildSwatches();
                    updatePreview();
                });
                LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(dp(46), dp(46));
                slp.setMarginStart(dp(5));
                slp.setMarginEnd(dp(5));
                row.addView(sw, slp);
            }
            swatchContainer.addView(row);
        }
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private MaterialButton themeButton(String label, final String mode, String current) {
        MaterialButton b = new MaterialButton(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(13.5f);
        b.setInsetTop(0);
        b.setInsetBottom(0);
        b.setElevation(0f);
        boolean on = mode.equals(current);
        if (on) {
            b.setBackgroundTintList(ColorStateList.valueOf(
                    Ui.col(this, com.google.android.material.R.attr.colorSecondaryContainer)));
            b.setTextColor(Ui.col(this,
                    com.google.android.material.R.attr.colorOnSecondaryContainer));
            b.setStrokeWidth(0);
        } else {
            b.setBackgroundTintList(ColorStateList.valueOf(0x00000000));
            b.setTextColor(Ui.onSurfaceVariant(this));
            b.setStrokeColor(ColorStateList.valueOf(Ui.outlineVariant(this)));
            b.setStrokeWidth(dp(1));
        }
        b.setOnClickListener(v -> {
            if (mode.equals(prefs.themeMode())) return;
            prefs.setThemeMode(mode);
            AppCompatDelegate.setDefaultNightMode(App.nightMode(mode));
        });
        return b;
    }

    private MaterialCardView buildPreviewCard() {
        MaterialCardView card = Ui.card(this);
        card.setCardBackgroundColor(Ui.surfaceContainerHigh(this));
        return card;
    }

    private void updatePreview() {
        if (!(previewCard instanceof MaterialCardView)) return;
        MaterialCardView card = (MaterialCardView) previewCard;
        card.removeAllViews();

        boolean dynamic = prefs.dynamicColor();
        int seed = dynamic ? Ui.primary(this) : Accents.parse(prefs.accentColor());
        int onSeed = luminance(seed) > 0.6 ? Color.BLACK : Color.WHITE;
        int container = dynamic
                ? Ui.col(this, com.google.android.material.R.attr.colorSecondaryContainer)
                : Ui.withAlpha(seed, 0.16f);
        int onContainer = dynamic
                ? Ui.col(this, com.google.android.material.R.attr.colorOnSecondaryContainer)
                : seed;

        LinearLayout box = Ui.vertical(this);
        box.setPadding(dp(16), dp(14), dp(16), dp(16));

        MaterialTextView caption = new MaterialTextView(this);
        caption.setText(dynamic ? "Так выглядит палитра обоев" : "Так выглядит выбранный цвет");
        caption.setTextSize(12);
        caption.setTextColor(Ui.onSurfaceVariant(this));
        box.addView(caption);

        LinearLayout row = Ui.horizontal(this);
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rlp.topMargin = dp(12);
        row.setLayoutParams(rlp);

        MaterialButton button = new MaterialButton(this);
        button.setText("Кнопка");
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setInsetTop(0);
        button.setInsetBottom(0);
        button.setBackgroundTintList(ColorStateList.valueOf(seed));
        button.setTextColor(onSeed);
        row.addView(button, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)));

        MaterialTextView chip = new MaterialTextView(this);
        chip.setText("Акцент");
        chip.setTextSize(13);
        chip.setTextColor(onContainer);
        chip.setBackgroundColor(container);
        chip.setPadding(dp(16), dp(9), dp(16), dp(9));
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clp.setMarginStart(dp(10));
        row.addView(chip, clp);
        box.addView(row);

        MaterialTextView sample = new MaterialTextView(this);
        sample.setText("Ссылки, выделения и активные элементы используют этот цвет.");
        sample.setTextSize(13);
        sample.setTextColor(onContainer);
        sample.setPadding(0, dp(12), 0, 0);
        box.addView(sample);

        card.addView(box);
    }

    private static double luminance(int color) {
        double r = Color.red(color) / 255.0;
        double g = Color.green(color) / 255.0;
        double b = Color.blue(color) / 255.0;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    // ── Шаг 4. Приватность ──────────────────────────────────────────────────

    private void renderPrivacy() {
        header(R.drawable.ic_shield, "Приватность и данные",
                "Пара полезных настроек по умолчанию. Всё это можно изменить позже в «Настройках».");

        MaterialCardView card = Ui.card(this);
        LinearLayout inner = Ui.vertical(this);
        inner.addView(Ui.switchRow(this, R.drawable.ic_shield,
                "Блокировать всплывающие окна",
                "Навязчивые pop-up не будут мешать",
                prefs.blockPopups(), (b, v) -> prefs.setBlockPopups(v)));
        inner.addView(Ui.divider(this));
        inner.addView(Ui.switchRow(this, R.drawable.ic_history,
                "Сохранять историю посещений",
                "Нужна для подсказок и «Часто посещаемых»",
                prefs.saveHistory(), (b, v) -> prefs.setSaveHistory(v)));
        inner.addView(Ui.divider(this));
        inner.addView(Ui.switchRow(this, R.drawable.ic_history,
                "Показывать «Часто посещаемые»",
                "Плитки из истории на новой вкладке",
                prefs.showTopSites(), (b, v) -> prefs.setShowTopSites(v)));
        inner.addView(Ui.divider(this));
        inner.addView(Ui.switchRow(this, R.drawable.ic_desktop,
                "Версия для ПК по умолчанию",
                "Запрашивать десктопные версии сайтов",
                prefs.desktopUa(), (b, v) -> prefs.setDesktopUa(v)));
        card.addView(inner);
        body.addView(card, matchWrap());

        body.addView(text("Приватные вкладки не сохраняются и не восстанавливаются "
                + "после перезапуска — это часть защиты.", false));
    }

    // ── Шаг 5. Итог ─────────────────────────────────────────────────────────

    private void renderSummary() {
        header(R.drawable.ic_check, "Всё готово!",
                "MokomailBrowser настроен. Приятного использования — и заглядывайте в наши соцсети.");

        MaterialCardView card = Ui.card(this);
        LinearLayout inner = Ui.vertical(this);
        inner.setPadding(0, dp(4), 0, dp(4));

        String engine = Engines.name(prefs.searchEngine());
        if ("custom".equals(prefs.searchEngine())) engine = "Своя ссылка";
        summaryRow(inner, "Поиск", engine);
        summaryRow(inner, "Тема", App.themeLabel(prefs.themeMode()));
        summaryRow(inner, "Акцент", prefs.dynamicColor()
                ? "Material You" : Accents.normalize(prefs.accentColor()));
        summaryRow(inner, "Часто посещаемые", prefs.showTopSites() ? "Показывать" : "Скрыты");
        summaryRow(inner, "Всплывающие окна", prefs.blockPopups() ? "Блокировать" : "Разрешать");
        body.addView(card, matchWrap());

        body.addView(sectionLabel("МЫ В СЕТИ"));
        MaterialButton tiktok = socialButton("TikTok — @mokomail",
                "https://www.tiktok.com/@mokomail");
        body.addView(tiktok);
        MaterialButton github = socialButton("GitHub — mokomail",
                "https://github.com/mokomail");
        LinearLayout.LayoutParams glp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        glp.topMargin = dp(8);
        body.addView(github, glp);

        body.addView(text("Настройки можно изменить в любой момент — "
                + "меню → «Настройки» или «Первоначальная настройка».", false));
    }

    private void summaryRow(LinearLayout parent, String key, String value) {
        if (parent.getChildCount() > 0) parent.addView(Ui.divider(this));
        LinearLayout row = Ui.horizontal(this);
        row.setPadding(dp(16), dp(13), dp(16), dp(13));

        MaterialTextView k = new MaterialTextView(this);
        k.setText(key);
        k.setTextSize(13.5f);
        k.setTextColor(Ui.onSurfaceVariant(this));
        row.addView(k, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        MaterialTextView v = new MaterialTextView(this);
        v.setText(value);
        v.setTextSize(13.5f);
        v.setTypeface(Typeface.DEFAULT_BOLD);
        v.setTextColor(Ui.onSurface(this));
        v.setGravity(Gravity.END);
        row.addView(v);
        parent.addView(row);
    }

    private MaterialButton socialButton(String label, final String url) {
        MaterialButton b = Ui.tonalButton(this, label, v -> openLink(url));
        b.setAllCaps(false);
        b.setTextSize(14);
        b.setIconResource(R.drawable.ic_globe);
        b.setIconGravity(MaterialButton.ICON_GRAVITY_TEXT_START);
        b.setInsetTop(0);
        b.setInsetBottom(0);
        b.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));
        return b;
    }

    private void openLink(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {}
    }

    // ── Общие помощники ─────────────────────────────────────────────────────

    private void header(int iconRes, String title, String text) {
        FrameLayout circle = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Ui.col(this, com.google.android.material.R.attr.colorPrimaryContainer));
        circle.setBackground(bg);
        ImageView ic = new ImageView(this);
        ic.setImageResource(iconRes);
        ic.setImageTintList(ColorStateList.valueOf(
                Ui.col(this, com.google.android.material.R.attr.colorOnPrimaryContainer)));
        FrameLayout.LayoutParams ilp = new FrameLayout.LayoutParams(dp(28), dp(28));
        ilp.gravity = Gravity.CENTER;
        circle.addView(ic, ilp);
        addCentered(circle, 62, 62, 8);

        MaterialTextView t = new MaterialTextView(this);
        t.setText(title);
        t.setTextSize(24);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        t.setTextColor(Ui.onSurface(this));
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tlp.topMargin = dp(16);
        body.addView(t, tlp);

        body.addView(text(text, true));
    }

    private MaterialTextView text(String value, boolean centered) {
        return text(value, centered, 14);
    }

    private MaterialTextView text(String value, boolean centered, float size) {
        MaterialTextView t = new MaterialTextView(this);
        t.setText(value);
        t.setTextSize(size);
        t.setTextColor(Ui.onSurfaceVariant(this));
        if (centered) t.setGravity(Gravity.CENTER);
        t.setLineSpacing(dp(2), 1f);
        t.setPadding(0, dp(8), 0, dp(10));
        return t;
    }

    private MaterialTextView sectionLabel(String value) {
        MaterialTextView t = new MaterialTextView(this);
        t.setText(value);
        t.setTextSize(11.5f);
        t.setLetterSpacing(0.08f);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setTextColor(Ui.primary(this));
        t.setPadding(dp(2), dp(16), dp(2), dp(2));
        return t;
    }

    private void addCentered(View v, int w, int h, int topMargin) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(w), dp(h));
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        lp.topMargin = dp(topMargin);
        body.addView(v, lp);
    }

    private View gap(int px) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, px));
        return v;
    }

    private boolean isNight() {
        return (getResources().getConfiguration().uiMode
                & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
                == android.content.res.Configuration.UI_MODE_NIGHT_YES;
    }

    private int dp(float v) {
        return Ui.dp(this, v);
    }
}
