/**
 * DRAM Performance Monitor
 * Tracks application performance metrics and resource usage.
 * Helps ensure the app meets the "Jarvis" experience criteria.
 */

import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';

/**
 * Performance metrics snapshot
 * @typedef {Object} PerformanceMetrics
 * @property {number} timestamp - When metrics were recorded
 * @property {number} memoryUsedMB - Memory usage in MB
 * @property {number} memoryTotalMB - Total system memory in MB
 * @property {number} cpuUsagePercent - CPU usage percentage
 * @property {number} uptimeSeconds - Process uptime
 * @property {Object} timings - Key operation timings
 */

export class PerformanceMonitor {
  constructor() {
    this.metrics = [];
    this.maxMetricsHistory = 1000;
    this.timings = new Map();
    this.isRecording = false;
    this.recordInterval = null;
    
    // Performance thresholds (from DRAM_ROADMAP.md success criteria)
    this.thresholds = {
      engineStartupMs: 3000,
      messageLatencyMs: 500,
      memoryMB: 500,
      cpuIdlePercent: 2
    };
  }

  /**
   * Start continuous performance recording
   * @param {number} intervalMs - Recording interval in milliseconds (default: 5000)
   */
  startRecording(intervalMs = 5000) {
    if (this.isRecording) return;
    
    this.isRecording = true;
    this.recordInterval = setInterval(() => {
      this.recordSnapshot();
    }, intervalMs);
    
    console.log('[PerformanceMonitor] Started recording');
  }

  /**
   * Stop continuous performance recording
   */
  stopRecording() {
    if (this.recordInterval) {
      clearInterval(this.recordInterval);
      this.recordInterval = null;
    }
    this.isRecording = false;
    console.log('[PerformanceMonitor] Stopped recording');
  }

  /**
   * Record a performance snapshot
   * @returns {PerformanceMetrics}
   */
  recordSnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      memoryUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      memoryTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      cpuUsagePercent: process.cpuUsage ? this.getCPUUsage() : 0,
      uptimeSeconds: Math.round(process.uptime()),
      timings: Object.fromEntries(this.timings)
    };

    this.metrics.push(snapshot);
    
    // Keep only recent history
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }

    // Check thresholds and warn
    this.checkThresholds(snapshot);

    return snapshot;
  }

  /**
   * Calculate CPU usage percentage
   * @returns {number}
   */
  getCPUUsage() {
    try {
      const usage = process.cpuUsage();
      // Convert microseconds to percentage (simplified)
      const totalUsage = (usage.user + usage.system) / 1000000;
      return Math.min(100, totalUsage);
    } catch {
      return 0;
    }
  }

  /**
   * Check if metrics exceed thresholds and log warnings
   * @param {PerformanceMetrics} snapshot
   */
  checkThresholds(snapshot) {
    if (snapshot.memoryUsedMB > this.thresholds.memoryMB) {
      console.warn(`[PerformanceMonitor] High memory usage: ${snapshot.memoryUsedMB}MB (threshold: ${this.thresholds.memoryMB}MB)`);
    }
  }

  /**
   * Start timing an operation
   * @param {string} operationId - Unique identifier for the operation
   */
  startTimer(operationId) {
    this.timings.set(operationId, performance.now());
  }

  /**
   * End timing an operation and return duration
   * @param {string} operationId - Operation identifier
   * @returns {number|null} Duration in milliseconds or null if not found
   */
  endTimer(operationId) {
    const startTime = this.timings.get(operationId);
    if (!startTime) return null;
    
    const duration = performance.now() - startTime;
    this.timings.delete(operationId);
    
    // Store in metrics with special key
    this.timings.set(`${operationId}_last`, duration);
    
    // Log slow operations
    if (duration > 1000) {
      console.warn(`[PerformanceMonitor] Slow operation: ${operationId} took ${Math.round(duration)}ms`);
    }
    
    return duration;
  }

  /**
   * Time an async function execution
   * @param {string} operationId - Operation identifier
   * @param {Function} fn - Async function to time
   * @returns {Promise<any>} Function result
   */
  async timeAsync(operationId, fn) {
    this.startTimer(operationId);
    try {
      const result = await fn();
      return result;
    } finally {
      this.endTimer(operationId);
    }
  }

  /**
   * Get average metrics over a time window
   * @param {number} windowMs - Time window in milliseconds (default: 60000 = 1 minute)
   * @returns {Object} Averaged metrics
   */
  getAverageMetrics(windowMs = 60000) {
    const cutoff = Date.now() - windowMs;
    const recent = this.metrics.filter(m => m.timestamp > cutoff);
    
    if (recent.length === 0) return null;

    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
      count: recent.length,
      memoryUsedMB: Math.round(avg(recent.map(m => m.memoryUsedMB))),
      cpuUsagePercent: Math.round(avg(recent.map(m => m.cpuUsagePercent)) * 100) / 100,
      uptimeSeconds: recent[recent.length - 1]?.uptimeSeconds || 0
    };
  }

  /**
   * Get metrics summary for health checks
   * @returns {Object} Health status
   */
  getHealthStatus() {
    const recent = this.getAverageMetrics(60000);
    if (!recent) return { status: 'unknown' };

    const issues = [];
    
    if (recent.memoryUsedMB > this.thresholds.memoryMB) {
      issues.push(`Memory usage high: ${recent.memoryUsedMB}MB`);
    }
    if (recent.cpuUsagePercent > 50) {
      issues.push(`CPU usage high: ${recent.cpuUsagePercent}%`);
    }

    return {
      status: issues.length === 0 ? 'healthy' : 'degraded',
      issues,
      metrics: recent
    };
  }

  /**
   * Export metrics to file for analysis
   * @returns {Promise<string>} Path to exported file
   */
  async exportMetrics() {
    try {
      const exportPath = path.join(app.getPath('logs'), 'dram-performance.json');
      const data = {
        exportedAt: new Date().toISOString(),
        thresholds: this.thresholds,
        metrics: this.metrics
      };
      
      await fs.mkdir(path.dirname(exportPath), { recursive: true });
      await fs.writeFile(exportPath, JSON.stringify(data, null, 2));
      
      return exportPath;
    } catch (err) {
      console.error('[PerformanceMonitor] Export failed:', err);
      return null;
    }
  }

  /**
   * Clear all recorded metrics
   */
  clearMetrics() {
    this.metrics = [];
    this.timings.clear();
    console.log('[PerformanceMonitor] Metrics cleared');
  }
}

// Singleton instance
let instance = null;
export function getPerformanceMonitor() {
  if (!instance) {
    instance = new PerformanceMonitor();
  }
  return instance;
}
