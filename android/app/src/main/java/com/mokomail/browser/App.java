package com.mokomail.browser;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatDelegate;

/**
 * Приложение: включает выбранную тему и применяет акцентную палитру Material 3
 * к каждой активности (content-based dynamic colors, Android 12+).
 */
public class App extends Application {

    @Override
    public void onCreate() {
        super.onCreate();

        // Тема: системная / светлая / тёмная.
        AppCompatDelegate.setDefaultNightMode(nightMode(new Prefs(this).themeMode()));

        // Палитра читается при создании каждой активности, поэтому смена
        // акцента в настройках подхватывается сразу после recreate().
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override
            public void onActivityPreCreated(@NonNull Activity activity,
                                             @Nullable Bundle savedInstanceState) {
                Accents.apply(activity);
            }

            @Override public void onActivityCreated(@NonNull Activity activity, @Nullable Bundle b) {}
            @Override public void onActivityStarted(@NonNull Activity activity) {}
            @Override public void onActivityResumed(@NonNull Activity activity) {}
            @Override public void onActivityPaused(@NonNull Activity activity) {}
            @Override public void onActivityStopped(@NonNull Activity activity) {}
            @Override public void onActivitySaveInstanceState(@NonNull Activity activity, @NonNull Bundle b) {}
            @Override public void onActivityDestroyed(@NonNull Activity activity) {}
        });
    }

    public static int nightMode(String mode) {
        if ("light".equals(mode)) return AppCompatDelegate.MODE_NIGHT_NO;
        if ("dark".equals(mode)) return AppCompatDelegate.MODE_NIGHT_YES;
        return AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM;
    }

    public static String themeLabel(String mode) {
        if ("light".equals(mode)) return "Светлая";
        if ("dark".equals(mode)) return "Тёмная";
        return "Системная";
    }
}
