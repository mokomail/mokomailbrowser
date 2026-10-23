package com.mokomail.browser;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.google.android.material.appbar.MaterialToolbar;
import com.google.android.material.textview.MaterialTextView;

/** Экран «О браузере» в стиле Material 3. */
public class AboutActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        LinearLayout root = Ui.vertical(this);
        root.setBackgroundColor(Ui.col(this, com.google.android.material.R.attr.colorSurface));

        MaterialToolbar toolbar = new MaterialToolbar(this);
        toolbar.setTitle("О браузере");
        toolbar.setNavigationIcon(R.drawable.ic_arrow_back);
        toolbar.setNavigationIconTint(Ui.onSurface(this));
        toolbar.setNavigationOnClickListener(v -> finish());
        toolbar.setBackgroundColor(Ui.col(this, com.google.android.material.R.attr.colorSurface));
        root.addView(toolbar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        androidx.core.widget.NestedScrollView scroll = new androidx.core.widget.NestedScrollView(this);
        LinearLayout box = Ui.vertical(this);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        box.setPadding(Ui.dp(this, 24), Ui.dp(this, 28), Ui.dp(this, 24), Ui.dp(this, 28));

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.ic_logo);
        box.addView(logo, new LinearLayout.LayoutParams(Ui.dp(this, 96), Ui.dp(this, 96)));

        com.google.android.material.textview.MaterialTextView name =
                new com.google.android.material.textview.MaterialTextView(this);
        name.setText("MokomailBrowser");
        name.setTextSize(26);
        name.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        name.setTextColor(Ui.onSurface(this));
        name.setPadding(0, Ui.dp(this, 16), 0, 0);
        box.addView(name);

        com.google.android.material.textview.MaterialTextView ver =
                new com.google.android.material.textview.MaterialTextView(this);
        ver.setText("Версия " + version() + " • команда MokomailTeam");
        ver.setTextColor(Ui.onSurfaceVariant(this));
        box.addView(ver);

        com.google.android.material.textview.MaterialTextView desc =
                new com.google.android.material.textview.MaterialTextView(this);
        desc.setText("Быстрый и приватный браузер. Настольная версия и мобильный порт "
                + "в едином стиле Material You.");
        desc.setGravity(Gravity.CENTER);
        desc.setTextColor(Ui.onSurfaceVariant(this));
        desc.setPadding(0, Ui.dp(this, 16), 0, Ui.dp(this, 8));
        box.addView(desc);

        com.google.android.material.card.MaterialCardView card = Ui.card(this);
        LinearLayout inner = Ui.vertical(this);
        inner.addView(Ui.actionRow(this, R.drawable.ic_globe, "TikTok — @mokomail",
                () -> open("https://www.tiktok.com/@mokomail")));
        inner.addView(Ui.divider(this));
        inner.addView(Ui.actionRow(this, R.drawable.ic_globe, "GitHub — mokomail",
                () -> open("https://github.com/mokomail")));
        inner.addView(Ui.divider(this));
        inner.addView(Ui.actionRow(this, R.drawable.ic_shield, "Сторонние лицензии",
                () -> open("https://developer.android.com/")));
        card.addView(inner);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clp.setMargins(0, Ui.dp(this, 16), 0, 0);
        card.setLayoutParams(clp);
        box.addView(card);

        scroll.addView(box, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);

        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
                .setAppearanceLightStatusBars(!isNight());
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
                .setAppearanceLightNavigationBars(!isNight());
        ViewCompat.setOnApplyWindowInsetsListener(scroll, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(0, bars.top, 0, bars.bottom);
            return insets;
        });
    }

    private boolean isNight() {
        return (getResources().getConfiguration().uiMode
                & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
                == android.content.res.Configuration.UI_MODE_NIGHT_YES;
    }

    private String version() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "1.0";
        }
    }

    private void open(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {}
    }
}
