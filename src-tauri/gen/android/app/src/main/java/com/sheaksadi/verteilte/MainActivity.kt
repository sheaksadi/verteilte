package com.sheaksadi.verteilte

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Allow content to extend under the system bars
    androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)

    // Ensure the status bar is fully transparent
    window.statusBarColor = android.graphics.Color.TRANSPARENT

    // Hide the status bar
    val controller = androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
    controller.systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    controller.hide(androidx.core.view.WindowInsetsCompat.Type.statusBars())

    // Handle keyboard insets
    androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content)) { view, insets ->
      val bottomInset = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.ime()).bottom
      view.setPadding(0, 0, 0, bottomInset)
      insets
    }
  }
}
