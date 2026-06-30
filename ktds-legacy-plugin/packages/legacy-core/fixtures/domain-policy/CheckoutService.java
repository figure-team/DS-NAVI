package com.example.order;

public class CheckoutService {

  public String checkout(Account acc, Cart cart) {
    if (acc == null || !acc.isAuthenticated()) {
      return "deny";
    } else if (cart.isEmpty()) {
      return "empty";
    }

    String tier = acc.isVip() ? "VIP" : "STD";

    switch (acc.getGrade()) {
      case "A":
        return "gold:" + tier;
      default:
        return "normal:" + tier;
    }
  }

  public int fee(int amount) {
    return amount > 100000 ? 0 : 2500;
  }
}
