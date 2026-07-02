package com.brainx.gateway.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("brainx.gateway.httpclient.dns")
public class GatewayDnsProperties {

    private Duration queryTimeout = Duration.ofSeconds(1);
    private Duration cacheMaxTtl = Duration.ofSeconds(30);
    private Duration cacheMinTtl = Duration.ZERO;
    private Duration cacheNegativeTtl = Duration.ofSeconds(1);
    private int maxQueriesPerResolve = 4;
    private int ndots = 1;
    private boolean retryTcpOnTimeout = false;

    public Duration getQueryTimeout() {
        return queryTimeout;
    }

    public void setQueryTimeout(Duration queryTimeout) {
        if (queryTimeout != null) {
            this.queryTimeout = queryTimeout;
        }
    }

    public Duration getCacheMaxTtl() {
        return cacheMaxTtl;
    }

    public void setCacheMaxTtl(Duration cacheMaxTtl) {
        if (cacheMaxTtl != null) {
            this.cacheMaxTtl = cacheMaxTtl;
        }
    }

    public Duration getCacheMinTtl() {
        return cacheMinTtl;
    }

    public void setCacheMinTtl(Duration cacheMinTtl) {
        if (cacheMinTtl != null) {
            this.cacheMinTtl = cacheMinTtl;
        }
    }

    public Duration getCacheNegativeTtl() {
        return cacheNegativeTtl;
    }

    public void setCacheNegativeTtl(Duration cacheNegativeTtl) {
        if (cacheNegativeTtl != null) {
            this.cacheNegativeTtl = cacheNegativeTtl;
        }
    }

    public int getMaxQueriesPerResolve() {
        return maxQueriesPerResolve;
    }

    public void setMaxQueriesPerResolve(int maxQueriesPerResolve) {
        if (maxQueriesPerResolve > 0) {
            this.maxQueriesPerResolve = maxQueriesPerResolve;
        }
    }

    public int getNdots() {
        return ndots;
    }

    public void setNdots(int ndots) {
        if (ndots >= -1) {
            this.ndots = ndots;
        }
    }

    public boolean isRetryTcpOnTimeout() {
        return retryTcpOnTimeout;
    }

    public void setRetryTcpOnTimeout(boolean retryTcpOnTimeout) {
        this.retryTcpOnTimeout = retryTcpOnTimeout;
    }
}
