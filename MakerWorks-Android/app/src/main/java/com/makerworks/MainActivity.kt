package com.makerworks

import android.Manifest
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import com.makerworks.ui.BarcodeScannerScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestPermission()
        setContent {
            MaterialTheme {
                Surface {
                    BarcodeScannerScreen()
                }
            }
        }
    }

    private fun requestPermission() {
        val launcher = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}
        launcher.launch(Manifest.permission.CAMERA)
    }
}
