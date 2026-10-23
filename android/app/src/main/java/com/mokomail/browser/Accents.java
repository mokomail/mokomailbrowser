package com.mokomail.browser;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

import com.google.android.material.color.DynamicColors;
import com.google.android.material.color.DynamicColorsOptions;

/**
 * Акцентные цвета (порт палитры ACCENTS из настольной версии) и их применение
 * через content-based dynamic colors Material 3.
 */
public final class Accents {

    public static final String DEFAULT = "#5b6bff";

    /** Та же палитра, что и в Windows-версии. */
    public static final String[] ALL = {
            "#5b6bff", "#4f6df5", "#7c4dff", "#b45cf0", "#e0518a",
            "#ef5350", "#ff8f3f", "#2bb673", "#00a5a5", "#3d7eff",
    };

    private Accents() {}

    /** Material You / content-based цвета доступны на Android 12+. */
    public static boolean isAvailable() {
        return DynamicColors.isDynamicColorAvailable();
    }

    public static int parse(String hex) {
        try {
            return Color.parseColor(normalize(hex));
        } catch (Exception e) {
            return Color.parseColor(DEFAULT);
        }
    }

    public static String normalize(String hex) {
        String v = hex == null ? "" : hex.trim();
        if (v.matches("#[0-9a-fA-F]{6}")) return v.toLowerCase();
        return DEFAULT;
    }

    /**
     * Применяет выбранную палитру к активности. Вызывается до создания view
     * (в Application через onActivityPreCreated), поэтому цвета успевают
     * подставиться в тему.
     */
    public static void apply(Activity activity) {
        if (!isAvailable()) return;
        Prefs prefs = new Prefs(activity);
        DynamicColorsOptions.Builder options = new DynamicColorsOptions.Builder();
        if (!prefs.dynamicColor()) {
            int seed = parse(prefs.accentColor());
            options.setContentBasedSource(seed);
        }
        DynamicColors.applyToActivityIfAvailable(activity, options.build());
    }

    /** Кружок-образец цвета с рамкой для выбранного варианта. */
    public static View swatch(Context c, String hex, boolean selected, Runnable click) {
        FrameLayout holder = new FrameLayout(c);
        int size = Ui.dp(c, 46);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(Color.TRANSPARENT);
        ring.setStroke(Ui.dp(c, 2),
                selected ? Ui.onSurface(c) : Ui.withAlpha(Ui.outlineVariant(c), 0.45f));
        holder.setBackground(ring);
        holder.setClickable(true);
        holder.setFocusable(true);
        holder.setContentDescription("Акцентный цвет " + normalize(hex));

        View dot = new View(c);
        GradientDrawable fill = new GradientDrawable();
        fill.setShape(GradientDrawable.OVAL);
        fill.setColor(parse(hex));
        dot.setBackground(fill);
        int dotSize = Ui.dp(c, 32);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dotSize, dotSize);
        lp.gravity = Gravity.CENTER;
        holder.addView(dot, lp);

        holder.setOnClickListener(v -> click.run());
        holder.setLayoutParams(new LinearLayout.LayoutParams(size, size));
        return holder;
    }
}
