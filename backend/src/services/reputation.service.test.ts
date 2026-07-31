import { describe, it, expect, beforeEach } from "@jest/globals";
import { ReputationService } from "./reputation.service.js";
import type { TaskScoring } from "../types/index.js";

// Test uniquement la logique pure (calculatePoints, getLevel) — sans DB ni blockchain
describe("ReputationService — logique pure", () => {
  let service: ReputationService;

  beforeEach(() => {
    // Prisma et chainRegistry ne sont pas appelés dans calculatePoints/getLevel
    service = new ReputationService(null as never, null as never);
  });

  describe("calculatePoints", () => {
    it("minimum : 1+1+1 = 30 pts de base", () => {
      const scoring: TaskScoring = { complexity: 1, effort: 1, impact: 1 };
      expect(service.calculatePoints(scoring, 30)).toBe(30);
    });

    it("maximum : 5+5+5 = 150 pts de base", () => {
      const scoring: TaskScoring = { complexity: 5, effort: 5, impact: 5 };
      expect(service.calculatePoints(scoring, 30)).toBe(150);
    });

    it("exemple canonique : complexity=3, effort=3, impact=4 → 100 pts", () => {
      const scoring: TaskScoring = { complexity: 3, effort: 3, impact: 4 };
      expect(service.calculatePoints(scoring, 30)).toBe(100);
    });

    it("bonus +10% si durée < 7j", () => {
      const scoring: TaskScoring = { complexity: 3, effort: 3, impact: 4 };
      // base = 100, bonus = 10 → 110
      expect(service.calculatePoints(scoring, 5)).toBe(110);
    });

    it("bonus +5% si durée < 14j", () => {
      const scoring: TaskScoring = { complexity: 3, effort: 3, impact: 4 };
      // base = 100, bonus = 5 → 105
      expect(service.calculatePoints(scoring, 10)).toBe(105);
    });

    it("pas de bonus si durée >= 14j", () => {
      const scoring: TaskScoring = { complexity: 3, effort: 3, impact: 4 };
      expect(service.calculatePoints(scoring, 14)).toBe(100);
      expect(service.calculatePoints(scoring, 30)).toBe(100);
    });
  });

  describe("getLevel", () => {
    it("0 pts → Unranked", () => {
      expect(service.getLevel(0)).toBe("Unranked");
    });

    it("99 pts → Unranked", () => {
      expect(service.getLevel(99)).toBe("Unranked");
    });

    it("100 pts → Junior", () => {
      expect(service.getLevel(100)).toBe("Junior");
    });

    it("499 pts → Junior", () => {
      expect(service.getLevel(499)).toBe("Junior");
    });

    it("500 pts → Senior", () => {
      expect(service.getLevel(500)).toBe("Senior");
    });

    it("1999 pts → Senior", () => {
      expect(service.getLevel(1999)).toBe("Senior");
    });

    it("2000 pts → Expert", () => {
      expect(service.getLevel(2000)).toBe("Expert");
    });

    it("9999 pts → Expert", () => {
      expect(service.getLevel(9999)).toBe("Expert");
    });
  });
});

describe("ProjectService — calcul commission", () => {
  it("< 5000 USDC → 12%", async () => {
    const { ProjectService } = await import("./project.service.js");
    const svc = new ProjectService(null as never, null as never, null as never);
    expect(svc.calculateCommission(1000)).toBeCloseTo(120);
    expect(svc.calculateCommission(4999)).toBeCloseTo(599.88);
  });

  it("5000–50000 USDC → 10%", async () => {
    const { ProjectService } = await import("./project.service.js");
    const svc = new ProjectService(null as never, null as never, null as never);
    expect(svc.calculateCommission(5000)).toBeCloseTo(500);
    expect(svc.calculateCommission(10000)).toBeCloseTo(1000);
  });

  it("> 50000 USDC → 8%", async () => {
    const { ProjectService } = await import("./project.service.js");
    const svc = new ProjectService(null as never, null as never, null as never);
    expect(svc.calculateCommission(100000)).toBeCloseTo(8000);
  });
});
