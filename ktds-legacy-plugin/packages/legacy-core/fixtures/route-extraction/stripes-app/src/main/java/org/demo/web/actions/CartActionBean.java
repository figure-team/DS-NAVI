package org.demo.web.actions;

import net.sourceforge.stripes.action.DefaultHandler;
import net.sourceforge.stripes.action.ForwardResolution;
import net.sourceforge.stripes.action.HandlesEvent;
import net.sourceforge.stripes.action.Resolution;
import net.sourceforge.stripes.action.UrlBinding;

@UrlBinding("/shop/cart.action")
public class CartActionBean extends AbstractActionBean {

    @DefaultHandler
    public Resolution view() {
        return new ForwardResolution("/cart.jsp");
    }

    @HandlesEvent("addItem")
    public Resolution addItem() {
        return new ForwardResolution("/cart.jsp");
    }
}
