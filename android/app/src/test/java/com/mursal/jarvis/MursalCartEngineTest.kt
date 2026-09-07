package com.mursal.jarvis

import com.mursal.jarvis.ecommerce.MursalCartEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class MursalCartEngineTest {

    private lateinit var engine: MursalCartEngine

    @Before
    fun setUp() {
        engine = MursalCartEngine()
    }

    @Test
    fun testWinningProductEvaluationProducesProfitableOutput() {
        val result = engine.evaluateProduct(
            productName = "T900 Ultra Smartwatch",
            category = "Electronics & Gadgets",
            supplierPricePkr = 1150.0,
            sellingPricePkr = 2499.0,
            courierCostPkr = 250.0
        )

        // Gross Profit: 2499 - (1150 + 250) = 1099
        assertEquals(1099.0, result.financials.grossProfitPkr, 0.1)

        // Margin should be > 40%
        assertTrue(result.financials.grossMarginPercentage > 40.0)

        // Return penalty considered
        assertTrue(result.financials.netEstimatedProfitPkr > 0)

        // 12 metrics evaluated
        assertEquals(12, result.metrics.size)
        assertTrue(result.overallScore >= 75)
    }

    @Test
    fun testLowMarginProductFlagsRisk() {
        val result = engine.evaluateProduct(
            productName = "Generic USB Cable",
            category = "Accessories",
            supplierPricePkr = 200.0,
            sellingPricePkr = 350.0,
            courierCostPkr = 250.0
        )

        // 350 - 450 = -100 (negative profit)
        assertTrue(result.financials.grossProfitPkr < 0)
        assertTrue(result.overallScore < 70)
    }
}
