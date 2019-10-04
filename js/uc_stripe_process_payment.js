/**
 * @file
 * uc_stripe.js
 *
 * Handles all interactions with Stripe on the client side for PCI-DSS compliance
 */
(function ($) {

  Drupal.behaviors.uc_stripe_process_payment = {
    attach: function (context) {
      
      $('#uc-cart-checkout-review-form, #uc-stripe-authenticate-payment-form', context).once('uc_stripe', function(){
        
        if (Drupal.settings && Drupal.settings.uc_stripe ) {
          var apikey = Drupal.settings.uc_stripe.apikey;
          var methodId = Drupal.settings.uc_stripe.methodId;
          var orderId = Drupal.settings.uc_stripe.orderId
          var stripe = Stripe(apikey);
        }
        
        var submitButton = $('#edit-submit');
        var processed = false;

        submitButton.click(function (e) {
          if(!processed){
            e.preventDefault();
            
            $.ajax({
              url: '/uc_stripe/ajax/confirm_payment',
              type: "POST",
              data: JSON.stringify({ payment_method_id: methodId, order_id: orderId }),
              contentType: 'application/json;',
              dataType: 'json',
              success: function(result){
                handleServerResponse(result);
              },
              error: function(result){
                handleServerResponse(result);
              }
            })
            
          }
          
      });

        function handleServerResponse(response) {
          if (response.error) {
            processed = true;
            submitButton.click();
            // Show error from server on payment form
          } else if (response.requires_action) {
            // Use Stripe.js to handle required card action
            stripe.handleCardAction(
              response.payment_intent_client_secret
            ).then(function(result) {
              if (result.error) {
                // Show error in payment form
                processed = true;
                submitButton.click();
              } else {
                // The card action has been handled
                // The PaymentIntent can be confirmed again on the server
                $.ajax({
                  url: '/uc_stripe/ajax/confirm_payment',
                  type: 'POST',
                  data: JSON.stringify({ payment_intent_id: result.paymentIntent.id, order_id: orderId }),
                  contentType: 'application/json;',
                  dataType: 'json',
                  success: function(confirmResult){
                    return handleServerResponse(confirmResult);
                  },
                  error: function(confirmResult){
                    return handleServerResponse(confirmResult);
                  },
                })
              }
            });
          } else {
            // Show success message
            processed = true;
            submitButton.click();
          }
        }

      });
      
    },

  };

}(jQuery));
