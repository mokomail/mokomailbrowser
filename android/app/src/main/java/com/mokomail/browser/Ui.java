package com.mokomail.browser;

import android.content.Context;
import android.content.res.ColorStateList;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CompoundButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.content.ContextCompat;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.color.MaterialColors;
import com.google.android.material.materialswitch.MaterialSwitch;
import com.google.android.material.textview.MaterialTextView;

/** Помощники для сборки интерфейса в стиле Material 3. */
public final class Ui {

    private Ui() {}

    public static int dp(Context c, float v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    public static int col(Context c, int attr) {
        TypedValue tv = new TypedValue();
        if (c.getTheme().resolveAttribute(attr, tv, true)) {
            if (tv.resourceId != 0) return ContextCompat.getColor(c, tv.resourceId);
            return tv.data;
        }
        return 0;
    }

    public static int primary(Context c) { return col(c, com.google.android.material.R.attr.colorPrimary); }
    public static int onSurface(Context c) { return col(c, com.google.android.material.R.attr.colorOnSurface); }
    public static int onSurfaceVariant(Context c) { return col(c, com.google.android.material.R.attr.colorOnSurfaceVariant); }
    public static int outlineVariant(Context c) { return col(c, com.google.android.material.R.attr.colorOutlineVariant); }
    public static int surfaceContainerLow(Context c) { return col(c, com.google.android.material.R.attr.colorSurfaceContainerLow); }
    public static int surfaceContainerHigh(Context c) { return col(c, com.google.android.material.R.attr.colorSurfaceContainerHigh); }
    public static int error(Context c) { return col(c, com.google.android.material.R.attr.colorError); }

    public static ColorStateList navTint(Context c) {
        int enabled = onSurfaceVariant(c);
        int disabled = (enabled & 0x00FFFFFF) | 0x61000000;
        return new ColorStateList(
                new int[][]{ new int[]{ -android.R.attr.state_enabled }, new int[]{} },
                new int[]{ disabled, enabled });
    }

    public static LinearLayout vertical(Context c) {
        LinearLayout box = new LinearLayout(c);
        box.setOrientation(LinearLayout.VERTICAL);
        return box;
    }

    public static LinearLayout horizontal(Context c) {
        LinearLayout box = new LinearLayout(c);
        box.setOrientation(LinearLayout.HORIZONTAL);
        box.setGravity(Gravity.CENTER_VERTICAL);
        return box;
    }

    public static void ripple(Context c, View v) {
        TypedValue tv = new TypedValue();
        c.getTheme().resolveAttribute(android.R.attr.selectableItemBackground, tv, true);
        v.setBackgroundResource(tv.resourceId);
    }

    public static MaterialCardView card(Context c) {
        MaterialCardView card = new MaterialCardView(c);
        card.setCardBackgroundColor(surfaceContainerLow(c));
        card.setRadius(dp(c, 20));
        card.setCardElevation(0f);
        card.setStrokeWidth(0);
        card.setClipToOutline(true);
        return card;
    }

    public static MaterialTextView label(Context c, String text) {
        MaterialTextView t = new MaterialTextView(c);
        t.setText(text);
        t.setTextSize(12);
        t.setAllCaps(false);
        t.setLetterSpacing(0.06f);
        t.getPaint().setFakeBoldText(true);
        t.setTextColor(primary(c));
        t.setPadding(dp(c, 8), dp(c, 14), dp(c, 8), dp(c, 6));
        return t;
    }

    public static MaterialTextView body(Context c, String text, int color) {
        MaterialTextView t = new MaterialTextView(c);
        t.setText(text);
        t.setTextSize(14);
        t.setTextColor(color);
        return t;
    }

    public static View divider(Context c) {
        View v = new View(c);
        v.setBackgroundColor(outlineVariant(c));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, dp(c, 0.6f)));
        lp.setMarginStart(dp(c, 56));
        v.setLayoutParams(lp);
        return v;
    }

    /** Строка-переход: иконка + заголовок/подпись + шеврон. */
    public static View navRow(Context c, int icon, String title, String sub, Runnable click) {
        LinearLayout row = horizontal(c);
        row.setMinimumHeight(dp(c, 56));
        row.setPadding(dp(c, 16), dp(c, 10), dp(c, 12), dp(c, 10));
        ripple(c, row);
        row.setClickable(true);
        row.setFocusable(true);

        ImageView ic = new ImageView(c);
        ic.setImageResource(icon);
        ic.setImageTintList(ColorStateList.valueOf(onSurfaceVariant(c)));
        row.addView(ic, new LinearLayout.LayoutParams(dp(c, 24), dp(c, 24)));

        LinearLayout col = vertical(c);
        col.setPadding(dp(c, 16), 0, dp(c, 8), 0);
        col.addView(body(c, title, onSurface(c)));
        if (sub != null && !sub.isEmpty()) {
            MaterialTextView s = body(c, sub, onSurfaceVariant(c));
            s.setTextSize(12);
            col.addView(s);
        }
        row.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        ImageView chev = new ImageView(c);
        chev.setImageResource(R.drawable.ic_chevron_right);
        chev.setImageTintList(ColorStateList.valueOf(onSurfaceVariant(c)));
        row.addView(chev, new LinearLayout.LayoutParams(dp(c, 22), dp(c, 22)));

        row.setOnClickListener(v -> click.run());
        return row;
    }

    /** Строка с переключателем Material You. */
    public static View switchRow(Context c, int icon, String title, String sub, boolean checked,
                                 CompoundButton.OnCheckedChangeListener listener) {
        LinearLayout row = horizontal(c);
        row.setMinimumHeight(dp(c, 56));
        row.setPadding(dp(c, 16), dp(c, 10), dp(c, 12), dp(c, 10));

        ImageView ic = new ImageView(c);
        ic.setImageResource(icon);
        ic.setImageTintList(ColorStateList.valueOf(onSurfaceVariant(c)));
        row.addView(ic, new LinearLayout.LayoutParams(dp(c, 24), dp(c, 24)));

        LinearLayout col = vertical(c);
        col.setPadding(dp(c, 16), 0, dp(c, 12), 0);
        col.addView(body(c, title, onSurface(c)));
        if (sub != null && !sub.isEmpty()) {
            MaterialTextView s = body(c, sub, onSurfaceVariant(c));
            s.setTextSize(12);
            col.addView(s);
        }
        row.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        MaterialSwitch sw = new MaterialSwitch(c);
        sw.setChecked(checked);
        sw.setOnCheckedChangeListener(listener);
        row.addView(sw);

        row.setOnClickListener(v -> sw.toggle());
        return row;
    }

    /** Строка-действие (акцентный текст). */
    public static View actionRow(Context c, int icon, String title, Runnable click) {
        LinearLayout row = horizontal(c);
        row.setMinimumHeight(dp(c, 56));
        row.setPadding(dp(c, 16), dp(c, 10), dp(c, 12), dp(c, 10));
        ripple(c, row);
        row.setClickable(true);
        row.setFocusable(true);

        ImageView ic = new ImageView(c);
        ic.setImageResource(icon);
        ic.setImageTintList(ColorStateList.valueOf(onSurfaceVariant(c)));
        row.addView(ic, new LinearLayout.LayoutParams(dp(c, 24), dp(c, 24)));

        MaterialTextView t = body(c, title, onSurface(c));
        t.setPadding(dp(c, 16), 0, 0, 0);
        row.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        row.setOnClickListener(v -> click.run());
        return row;
    }

    public static int withAlpha(int color, float a) {
        return (color & 0x00FFFFFF) | (Math.round(255 * a) << 24);
    }

    /** Текстовая кнопка Material 3 (прозрачный фон, акцентный текст). */
    public static MaterialButton textButton(Context c, String text, View.OnClickListener click) {
        MaterialButton b = new MaterialButton(c, null,
                com.google.android.material.R.attr.materialButtonStyle);
        b.setText(text);
        b.setBackgroundTintList(ColorStateList.valueOf(0x00000000));
        b.setTextColor(primary(c));
        b.setRippleColor(ColorStateList.valueOf(withAlpha(primary(c), 0.12f)));
        b.setInsetTop(0);
        b.setInsetBottom(0);
        if (click != null) b.setOnClickListener(click);
        return b;
    }

    /** Тональная кнопка Material 3. */
    public static MaterialButton tonalButton(Context c, String text, View.OnClickListener click) {
        MaterialButton b = new MaterialButton(c, null,
                com.google.android.material.R.attr.materialButtonStyle);
        b.setBackgroundTintList(ColorStateList.valueOf(
                col(c, com.google.android.material.R.attr.colorSecondaryContainer)));
        b.setTextColor(col(c, com.google.android.material.R.attr.colorOnSecondaryContainer));
        b.setRippleColor(ColorStateList.valueOf(
                withAlpha(col(c, com.google.android.material.R.attr.colorOnSecondaryContainer), 0.12f)));
        if (click != null) b.setOnClickListener(click);
        return b;
    }

    public static MaterialButton iconButton(Context c, int icon, String desc, View.OnClickListener click) {
        MaterialButton b = new MaterialButton(c, null,
                com.google.android.material.R.attr.materialIconButtonStyle);
        b.setIconResource(icon);
        b.setIconGravity(MaterialButton.ICON_GRAVITY_TEXT_START);
        b.setIconPadding(0);
        b.setIconSize(dp(c, 22));
        b.setInsetTop(0);
        b.setInsetBottom(0);
        b.setContentDescription(desc);
        b.setIconTint(navTint(c));
        b.setOnClickListener(click);
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(c, 44), dp(c, 44)));
        return b;
    }
}
