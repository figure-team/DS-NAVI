package org.demo.web.actions;

import net.sourceforge.stripes.action.ForwardResolution;
import net.sourceforge.stripes.action.HandlesEvent;
import net.sourceforge.stripes.action.Resolution;

public class CheckoutBean extends BaseSupport {

    @HandlesEvent("placeOrder")
    public Resolution submit() {
        return new ForwardResolution("/checkout.jsp");
    }
}
