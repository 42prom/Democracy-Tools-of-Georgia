# System Voting Capacity Assessment

Based on the current architecture and code-defined limits, here is an assessment of the maximum voting throughput of the system.

## 1. Explicit Architectural Limits

The system has several hard-coded or configuration-based limits that define its capacity:

| Component                    | Limit                                  | Source                      |
| :--------------------------- | :------------------------------------- | :-------------------------- |
| **Global API Rate Limit**    | **1,000 requests per minute** (per IP) | `middleware/rateLimit.ts`   |
| **Database Connection Pool** | **20 concurrent transactions**         | `db/client.ts` (`max: 20`)  |
| **Fail-rate Limiter (Auth)** | 3 failures per minute per account      | `services/authRateLimit.ts` |
| **Device-Voter Policy**      | Default 2 distinct voters per device   | `services/security.ts`      |

---

## 2. Throughput Estimation

### **A. System-Wide Capacity (The "Hard" Ceiling)**

The bottleneck for system-wide throughput is the **Database Connection Pool**. Each vote involves:

1.  **7-10 Database Queries** (Validation, Nonce Consumption, Demographics, etc.)
2.  **1 Complex Transaction** containing multiple `INSERT` operations (`votes`, `poll_participants`, `vote_nullifiers`, etc.).

**Calculation:**

- Assuming an average processing time of **40ms - 50ms** per vote (including network round-trips to the DB and processing).
- **20 concurrent connections** / 0.050s = **400 votes per second**.
- **400 votes/sec \* 60 seconds** = **24,000 votes per minute**.

> [!NOTE]
> In a high-load production environment with optimized Postgres and minimal network latency, this could potentially push towards **30,000+ per minute**. However, under realistic conditions with contention on the same poll (locking the `vote_nullifiers` or `poll_participants` indexes), **15,000 - 20,000 per minute** is a more stable estimate.

### **B. Per-IP Capacity (The "Soft" Ceiling)**

Regardless of the system's total power, a single IP address (e.g., a large office or a group of users behind a NAT) is restricted by the `apiLimiter` to **1,000 requests per minute**.

---

## 3. Potential Bottlenecks

1.  **Synchronous Setting Queries**: The `SecurityService` queries the `settings` table _for every single vote_ without caching. This adds unnecessary IO overhead.
2.  **Mock Rewards**: Currently, rewards are processed as a "Phase 0" mock transaction. If this were moved to a real blockchain with synchronous confirmation, the capacity would drop to single-digits per second.
3.  **Privacy Bucketing**: The system uses **10-minute buckets** for timestamps. While this protects privacy, if millions of votes are recorded in the same bucket, the database index performance might degrade slightly over time.

## 4. Summary Recommendation

| Metric                            | Capacity                              |
| :-------------------------------- | :------------------------------------ |
| **Max Votes per Minute (System)** | **~24,000**                           |
| **Max Votes per Minute (Per IP)** | **1,000**                             |
| **Concurrent Voters**             | **20** (simultaneous DB transactions) |

**To increase beyond 24,000/min:**

- Increase the `PG_POOL_MAX` in `client.ts`.
- Implement caching for security settings in `SecurityService.ts`.
- Increase the `apiLimiter`'s `max` setting if legitimate high-density voting (e.g., from a single building) is expected.
