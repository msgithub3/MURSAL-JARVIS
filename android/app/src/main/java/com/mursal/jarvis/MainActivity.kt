package com.mursal.jarvis

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mursal.jarvis.core.JarvisState
import com.mursal.jarvis.core.JarvisStateMachine
import com.mursal.jarvis.ecommerce.MursalCartEngine
import com.mursal.jarvis.service.JarvisVoiceForegroundService

class MainActivity : ComponentActivity() {

    private val stateMachine = JarvisStateMachine()
    private val cartEngine = MursalCartEngine()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            JarvisTheme {
                JarvisDashboardScreen(
                    stateMachine = stateMachine,
                    cartEngine = cartEngine,
                    onStartVoice = {
                        val serviceIntent = Intent(this, JarvisVoiceForegroundService::class.java).apply {
                            action = JarvisVoiceForegroundService.ACTION_START_VOICE
                        }
                        startForegroundService(serviceIntent)
                    },
                    onStopVoice = {
                        val serviceIntent = Intent(this, JarvisVoiceForegroundService::class.java).apply {
                            action = JarvisVoiceForegroundService.ACTION_STOP_VOICE
                        }
                        startService(serviceIntent)
                    }
                )
            }
        }
    }
}

@Composable
fun JarvisTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            background = Color(0xFF070B19),
            surface = Color(0xFF0E1626),
            primary = Color(0xFF00E5FF),
            secondary = Color(0xFF00F2FE),
            tertiary = Color(0xFFF59E0B)
        ),
        content = content
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JarvisDashboardScreen(
    stateMachine: JarvisStateMachine,
    cartEngine: MursalCartEngine,
    onStartVoice: () -> Unit,
    onStopVoice: () -> Unit
) {
    val currentState by stateMachine.currentState.collectAsState()
    var isVoiceServiceActive by remember { mutableStateOf(false) }
    var selectedTab by remember { mutableStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "MURSAL JARVIS",
                            fontWeight = FontWeight.Black,
                            letterSpacing = 2.sp,
                            color = Color(0xFF00E5FF),
                            fontFamily = FontFamily.Monospace
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = Color(0xFF10B981).copy(alpha = 0.2f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF10B981))
                        ) {
                            Text(
                                text = "CLOUD PRO",
                                fontSize = 10.sp,
                                color = Color(0xFF10B981),
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF070B19)
                )
            )
        },
        bottomBar = {
            NavigationBar(containerColor = Color(0xFF070B19)) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.GraphicEq, contentDescription = null) },
                    label = { Text("Core Voice") },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = Color(0xFF00E5FF))
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.ShoppingCart, contentDescription = null) },
                    label = { Text("MursalCart") },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = Color(0xFF00E5FF))
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.Share, contentDescription = null) },
                    label = { Text("Device Mesh") },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = Color(0xFF00E5FF))
                )
            }
        },
        containerColor = Color(0xFF070B19)
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            when (selectedTab) {
                0 -> {
                    // Orb & Voice Status
                    item {
                        JarvisOrbView(
                            state = currentState,
                            isActive = isVoiceServiceActive,
                            onToggle = {
                                if (isVoiceServiceActive) {
                                    onStopVoice()
                                    isVoiceServiceActive = false
                                } else {
                                    onStartVoice()
                                    isVoiceServiceActive = true
                                }
                            }
                        )
                    }
                    item {
                        TelemetryCard(currentState = currentState)
                    }
                }
                1 -> {
                    item {
                        MursalCartCard(cartEngine = cartEngine)
                    }
                }
                2 -> {
                    item {
                        DeviceMeshCard()
                    }
                }
            }
        }
    }
}

@Composable
fun JarvisOrbView(
    state: JarvisState,
    isActive: Boolean,
    onToggle: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFF0E1626))
            .border(1.dp, Color(0xFF00E5FF).copy(alpha = 0.3f), RoundedCornerShape(16.dp))
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(160.dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color(0xFF00E5FF).copy(alpha = 0.8f),
                            Color(0xFF0284C7).copy(alpha = 0.4f),
                            Color.Transparent
                        )
                    )
                )
                .border(2.dp, Color(0xFF00E5FF), CircleShape)
                .clickable { onToggle() },
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = if (isActive) Icons.Default.Mic else Icons.Default.MicOff,
                contentDescription = "JARVIS Voice Orb",
                tint = Color.White,
                modifier = Modifier.size(54.dp)
            )
        }

        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "STATE: ${state.name}",
            color = Color(0xFF00E5FF),
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            letterSpacing = 1.sp
        )
        Text(
            text = if (isActive) "Hotword spotter listening for \"Hey JARVIS\"" else "Tap Orb to engage Foreground Voice Engine",
            color = Color.Gray,
            fontSize = 12.sp
        )
    }
}

@Composable
fun TelemetryCard(currentState: JarvisState) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF0E1626)),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF1E293B))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("TELEMETRY CHANNELS", color = Color.White, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("AI Engine Model:", color = Color.Gray)
                Text("Gemini 3.8 Flash", color = Color(0xFF00E5FF), fontWeight = FontWeight.SemiBold)
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Latency Target:", color = Color.Gray)
                Text("< 450 ms", color = Color(0xFF10B981), fontWeight = FontWeight.SemiBold)
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Multilingual Audio:", color = Color.Gray)
                Text("UR / EN / Roman Urdu", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
fun MursalCartCard(cartEngine: MursalCartEngine) {
    val sampleResult = remember {
        cartEngine.evaluateProduct(
            productName = "T900 Ultra Smartwatch",
            category = "Electronics & Gadgets",
            supplierPricePkr = 1150.0,
            sellingPricePkr = 2499.0
        )
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF0E1626)),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF59E0B).copy(alpha = 0.4f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("MURSALCART 12-METRIC ENGINE", color = Color(0xFFF59E0B), fontWeight = FontWeight.Bold)
                Text("SCORE: ${sampleResult.overallScore}/100", color = Color(0xFF10B981), fontWeight = FontWeight.Black)
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text("Product: ${sampleResult.productName}", color = Color.White, fontWeight = FontWeight.SemiBold)
            Text("Status: ${sampleResult.recommendation}", color = Color(0xFF00E5FF), fontSize = 12.sp)

            Spacer(modifier = Modifier.height(12.dp))
            Text("Estimated Net Profit per Order: Rs. ${sampleResult.financials.netEstimatedProfitPkr.toInt()} (After 15% COD Return Buffer)", color = Color(0xFF10B981), fontSize = 13.sp)
        }
    }
}

@Composable
fun DeviceMeshCard() {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF0E1626)),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF00E5FF).copy(alpha = 0.3f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("SECURE DEVICE MESH & ANTI-LOSS", color = Color(0xFF00E5FF), fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Text("Node 1: Mursal Android Sovereign Client (Battery: 88% - Online)", color = Color.White)
            Text("Node 2: Mursal Cloud Brain Server (Latency: 22ms - Paired)", color = Color.White)
            Spacer(modifier = Modifier.height(12.dp))
            Button(
                onClick = {},
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00E5FF)),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("DISPATCH ANTI-LOSS BEACON", color = Color.Black, fontWeight = FontWeight.Bold)
            }
        }
    }
}
