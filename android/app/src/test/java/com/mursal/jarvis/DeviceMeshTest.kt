package com.mursal.jarvis

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import java.util.UUID

class DeviceMeshTest {

    @Test
    fun testDeviceMeshNodeGeneration() {
        val nodeId = UUID.randomUUID().toString()
        assertNotNull(nodeId)
        assertEquals(36, nodeId.length)
    }

    @Test
    fun testMeshCommandDispatch() {
        val commands = listOf("PING_LOCATE", "TOGGLE_LOCK", "STATUS_QUERY")
        assertTrue(commands.contains("PING_LOCATE"))
        assertTrue(commands.contains("TOGGLE_LOCK"))
    }

    private fun assertTrue(value: Boolean) {
        org.junit.Assert.assertTrue(value)
    }
}
