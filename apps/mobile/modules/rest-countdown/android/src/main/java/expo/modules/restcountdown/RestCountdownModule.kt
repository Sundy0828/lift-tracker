package expo.modules.restcountdown

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The rest countdown as an ongoing notification (see src/restCountdown.ts).
 *
 * The clock is the notification's own chronometer, counting down to `when`:
 * the system redraws it, so it keeps time with the app suspended or killed,
 * and nothing in JavaScript ticks. It shows on the lock screen, and on
 * Android 16 it asks to be promoted to a Live Update, which puts it in a
 * status-bar chip.
 *
 * It is silent on purpose. The alert at the deadline is expo-notifications'
 * job; this one only shows the time. It removes itself at the deadline.
 */
class RestCountdownModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  private val manager: NotificationManager
    get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  override fun definition() = ModuleDefinition {
    Name("RestCountdown")

    Function("show") { endsAt: Double, title: String, body: String ->
      show(endsAt.toLong(), title, body)
    }

    Function("hide") {
      manager.cancel(NOTIFICATION_ID)
    }
  }

  private fun show(endsAt: Long, title: String, body: String) {
    val remaining = endsAt - System.currentTimeMillis()
    if (remaining <= 0) {
      manager.cancel(NOTIFICATION_ID)
      return
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ensureChannel()
      Notification.Builder(context, CHANNEL_ID).setTimeoutAfter(remaining)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
    }

    builder
      .setSmallIcon(smallIcon())
      .setContentTitle(title)
      .setContentText(body)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(true)
      .setWhen(endsAt)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setCategory(Notification.CATEGORY_PROGRESS)

    launchIntent()?.let { builder.setContentIntent(it) }

    requestPromotion(builder)

    manager.notify(NOTIFICATION_ID, builder.build())
  }

  /**
   * Asks Android 16+ to show this as a Live Update (a status-bar chip).
   *
   * Called reflectively: this module is only ever compiled on EAS, so a
   * mismatch with the compile SDK's API would cost a whole build, and on an
   * older Android the method simply is not there. Either way the notification
   * still shows; only the chip is lost.
   */
  private fun requestPromotion(builder: Notification.Builder) {
    runCatching {
      Notification.Builder::class.java
        .getMethod("setRequestPromotedOngoing", Boolean::class.javaPrimitiveType)
        .invoke(builder, true)
    }
  }

  /** Low importance: on the lock screen and in the shade, but no sound or buzz. */
  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Rest countdown",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "The time left on a rest while it runs. Silent; the alert at the end is separate."
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  /** The monochrome icon expo-notifications generates, else the app icon. */
  private fun smallIcon(): Int {
    val generated = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (generated != 0) generated else context.applicationInfo.icon
  }

  /** Tapping it opens the app, back on the session. */
  private fun launchIntent(): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    intent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
  }

  private companion object {
    const val CHANNEL_ID = "rest-countdown"
    const val NOTIFICATION_ID = 7301
  }
}
