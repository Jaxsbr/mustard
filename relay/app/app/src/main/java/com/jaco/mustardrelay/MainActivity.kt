package com.jaco.mustardrelay

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.InputFilter
import android.text.TextWatcher
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import android.app.Activity
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {

    private lateinit var urlField: EditText
    private lateinit var noteField: EditText
    private lateinit var sendButton: Button

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private val maxLength = 2000

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        urlField = findViewById(R.id.url_field)
        noteField = findViewById(R.id.note_field)
        sendButton = findViewById(R.id.send_button)

        // Apply max length filters
        urlField.filters = arrayOf(InputFilter.LengthFilter(maxLength))
        noteField.filters = arrayOf(InputFilter.LengthFilter(maxLength))

        // Disable send button until URL is non-empty
        sendButton.isEnabled = false
        urlField.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                sendButton.isEnabled = !s.isNullOrBlank()
            }
        })

        sendButton.setOnClickListener { sendMessage() }

        // Handle share intent
        handleShareIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShareIntent(intent)
    }

    private fun handleShareIntent(intent: Intent) {
        if (intent.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
            val url = extractUrl(sharedText)
            urlField.setText(url ?: sharedText)
        }
    }

    private fun extractUrl(text: String): String? {
        val urlPattern = Regex("https?://[^\\s]+")
        return urlPattern.find(text)?.value
    }

    private fun sendMessage() {
        val url = urlField.text.toString().trim()
        val note = noteField.text.toString().trim()

        if (url.isEmpty()) {
            Toast.makeText(this, "URL is required", Toast.LENGTH_SHORT).show()
            return
        }

        val apiEndpoint = BuildConfig.API_ENDPOINT
        val apiKey = BuildConfig.API_KEY

        if (apiEndpoint.isEmpty()) {
            Toast.makeText(this, "API endpoint not configured", Toast.LENGTH_LONG).show()
            return
        }

        sendButton.isEnabled = false

        val payload = JSONObject().apply {
            put("url", url)
            put("relevance_note", note)
        }

        val message = JSONObject().apply {
            put("type", "research-request")
            put("version", 1)
            put("payload", payload)
            put("metadata", JSONObject().apply {
                put("id", UUID.randomUUID().toString())
                put("source", "android")
                put("timestamp", java.time.Instant.now().toString())
            })
        }

        val requestBody = message.toString()
            .toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url(apiEndpoint)
            .addHeader("x-api-key", apiKey)
            .addHeader("Content-Type", "application/json")
            .post(requestBody)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    sendButton.isEnabled = !urlField.text.isNullOrBlank()
                    Toast.makeText(
                        this@MainActivity,
                        "Network error: ${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }

            override fun onResponse(call: Call, response: Response) {
                runOnUiThread {
                    if (response.isSuccessful) {
                        Toast.makeText(
                            this@MainActivity,
                            "Sent!",
                            Toast.LENGTH_SHORT
                        ).show()
                        urlField.text.clear()
                        noteField.text.clear()
                        sendButton.isEnabled = false
                    } else {
                        sendButton.isEnabled = !urlField.text.isNullOrBlank()
                        Toast.makeText(
                            this@MainActivity,
                            "Error: ${response.code} ${response.message}",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
            }
        })
    }
}
