package demo;

import org.springframework.jms.core.JmsTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;

public class OrderMessaging {
  private final JmsTemplate jmsTemplate = new JmsTemplate();
  private KafkaTemplate<String, String> kafkaTemplate;

  public void notifyOrder(String payload) {
    jmsTemplate.convertAndSend("ORDER.QUEUE", payload);
    kafkaTemplate.send("order-events", payload);
  }

  @KafkaListener(topics = {"order-events"})
  public void onOrderEvent(String message) {
    // consume
  }
}
