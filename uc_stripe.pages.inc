<?php

/**
 * Implements hook_form().
 *
 * This form allows the user to authenticate in order for their recurring payment
 * to be processed.
 */
function uc_stripe_authenticate_payment_form($form, &$form_state, $hash) {
  $form = array();

  $pending_order = db_select('uc_stripe_pending_auth', 'u')
  ->fields('u', array('order_id', 'completed', 'rfee_id'))
  ->condition('hash', $hash)
  ->execute()
  ->fetchObject();


  if(!$pending_order){
    $form['error'] = array(
        '#markup' => t('Sorry, we could not verify your payment details. Please verify the link and try again. Contact support if the problem persists.'),
    );
    return $form;
  }

  $order_id = $pending_order->order_id;
  $completed = $pending_order->completed;
  $rfee_id = $pending_order->rfee_id;

  if ($completed) {
    $form['error'] = array(
        '#markup' => t('This payment has already been verified.'),
    );
    return $form;
  };

  $form['heading'] = array(
    '#markup' => t('<p>Your financial institution has requested additional verification to process your scheduled payment.</p>'),
  );

  $form['order_id'] = array(
    '#type' => 'hidden',
    '#value' => $order_id,
  );

  $form['rfee_id'] = array(
      '#type' => 'hidden',
      '#value' => $rfee_id,
  );

  $form['hash'] = array(
      '#type' => 'hidden',
      '#value' => $hash,
  );

  $form['submit'] = array(
    '#type' => 'submit',
    '#value' => t('Verify Payment')
  );

  $order = uc_order_load($order_id);
  $user = user_load($order->uid);
  $payment_method_id = _uc_stripe_get_payment_id($user->uid);
  $stripe_customer_id = _uc_stripe_get_customer_id($user->uid);

  $order_id = $order_id;
  $apikey = variable_get('uc_stripe_testmode', TRUE) ? check_plain(variable_get('uc_stripe_api_key_test_publishable', '')) : check_plain(variable_get('uc_stripe_api_key_live_publishable', ''));
  $settings = array('apikey' => $apikey, 'methodId' => $payment_method_id, 'orderId' => $order_id);

  //Attach Stripe v3 JS library and JS for processing payment
  $form['#attached']['js']['https://js.stripe.com/v3/'] = array('type' => 'external');
  $form['#attached']['js'][] = array('data' => array('uc_stripe' => $settings), 'type' => 'setting');
  $form['#attached']['js'][] = drupal_get_path('module', 'uc_stripe') . '/js/uc_stripe_process_payment.js';
  $form['#attached']['css'][] = drupal_get_path('module', 'uc_stripe') . '/css/uc_stripe.css';

  return $form;
}

function uc_stripe_authenticate_payment_form_submit($form, &$form_state){

  $order_id = $form_state['values']['order_id'];
  $rfee_id = $form_state['values']['rfee_id'];
  $hash = $form_state['values']['hash'];

  $order = uc_order_load($order_id);
  $intent_id = $order->data['payment_intent_id'];

  try{
    _uc_stripe_prepare_api();
    $payment_intent = \Stripe\PaymentIntent::retrieve($intent_id);

    if ($payment_intent->status != 'succeeded') {
      throw new Exception('Payment intent failed');
    }

    $charge_id = $payment_intent->charges->data[0]['id'];
    $amount = uc_currency_format($order->order_total, FALSE, FALSE, FALSE);

    $formatted_amount = $amount / 100;
    $formatted_amount = number_format($formatted_amount, 2);

    $message = t('Payment of @amount processed successfully, Stripe transaction id @transaction_id.', array('@amount' => $formatted_amount, '@transaction_id' => $charge_id));
    $COMPLETED = 1;

    //Set all orders matching the order id and fee id to completed. This is incase
    // there were multiple attempts to process the subscription.
    db_update('uc_stripe_pending_auth')
    ->fields(array(
        'completed' => $COMPLETED,
    ))
    ->condition('order_id', $order_id)
    ->condition('rfee_id', $rfee_id)
    ->execute();

    $fee = uc_recurring_fee_user_load($rfee_id);
    uc_payment_enter($order->order_id, $order->payment_method, $order->order_total, $fee->uid, $payment_intent, "Success");

    // Since we have processed the payment here already, we'll temporarily change the fee
    // handler to the the default uc_recurring fee handler that simply returns TRUE
    // without any processing.
    $fee->fee_handler = 'default';
    $id = uc_recurring_renew($fee);

    // We need to reset the fee handler for this order back to uc_stripe so that
    // future subscriptions work.
    $fee = uc_recurring_fee_user_load($fee->rfid);
    $fee->fee_handler = 'uc_stripe';
    uc_recurring_fee_user_save($fee);

    uc_order_comment_save($order_id, $order->uid, $message, 'admin');
    uc_order_comment_save($order_id, $order->uid, $message, 'order', 'completed', FALSE);

    $form_state['redirect'] = '/';
    drupal_set_message('You have successfully completed your payment');

  } catch (Exception $e) {

    $message = t("Stripe Charge Failed for order !order: !message", array(
        "!order" => $order_id,
        "!message" => $e->getMessage()
    ));

    uc_order_comment_save($order_id, $order->uid, $message, 'admin');
    watchdog('uc_stripe', 'Stripe charge failed for order @order, message: @message', array('@order' => $order_id, '@message' => $message));
    $fail_message = variable_get('uc_credit_fail_message', t('We were unable to process your credit card payment. Please verify your details and try again.  If the problem persists, contact us to complete your order.'));
    drupal_set_message($fail_message, 'error');

  }
}
