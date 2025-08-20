package com.makerworks.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.post
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

class FilamentService(
    private val client: HttpClient = HttpClient(Android) {
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
    },
    private val baseUrl: String = "http://localhost:8000"
) {
    @Serializable
    data class Filament(val type: String, val color: String, val hex: String)

    suspend fun submit(code: String) {
        val parts = code.split("|")
        if (parts.size == 3) {
            val filament = Filament(parts[0], parts[1], parts[2])
            client.post("$baseUrl/filaments") {
                setBody(filament)
            }.body<Unit>()
        }
    }
}
