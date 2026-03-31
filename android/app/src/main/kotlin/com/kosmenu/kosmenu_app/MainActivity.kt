package com.kosmenu.kosmenu_app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		createOrdersNotificationChannel()
	}

	private fun createOrdersNotificationChannel() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
			return
		}

		val soundUri = Uri.parse("android.resource://$packageName/raw/cash_register")
		val audioAttributes = AudioAttributes.Builder()
			.setUsage(AudioAttributes.USAGE_NOTIFICATION)
			.setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
			.build()

		val channel = NotificationChannel(
			"pedidos_channel",
			"Pedidos Nuevos",
			NotificationManager.IMPORTANCE_HIGH,
		).apply {
			description = "Notificaciones de pedidos entrantes"
			enableVibration(true)
			setSound(soundUri, audioAttributes)
		}

		val manager = getSystemService(NotificationManager::class.java)
		manager.createNotificationChannel(channel)
	}
}
