/**
 * @file
 * uc_stripe.js
 *
 * Handles all interactions with Stripe on the client side for PCI-DSS compliance
 */
(function ($) {

  Drupal.behaviors.uc_stripe = {
    attach: function (context) {
      
      // Once function prevents stripe from reloading. Any dom changes to stripe area will destroy element
      // as a Stripe security feature
      $('#uc-cart-checkout-form', context).once('uc_stripe', function(){
        
        var stripe_card_element = '#stripe-card-element';
        
        if (Drupal.settings && Drupal.settings.uc_stripe ) {
          var apikey = Drupal.settings.uc_stripe.apikey;
          
          var stripe = Stripe(apikey);
          var elements = stripe.elements();
        }
           
        
      // Map stripe names to (partial) Ubercart field names; Ubercart names add "billing_" or "shipping_" on the front.
        const address_field_mapping = {
          "address_line1": "street1",
          "address_line2": "street2",
          "address_city": "city",
          "address_state": "zone",
          "address_zip": "postal_code",
          "address_country": "country"
        };
        var submitButton = $('.uc-cart-checkout-form #edit-continue');

        // Load the js reference to these fields so that on the review page 
        // we can input the last 4 and expiration date which is returned to us by stripe paymentMethod call
        var cc_container = $('.payment-details-credit');
        var cc_num = cc_container.find(':input[id*="edit-panes-payment-details-cc-numbe"]');
        var cc_cvv = cc_container.find(':input[id*="edit-panes-payment-details-cc-cv"]');
        var cc_exp_month = cc_container.find('#edit-panes-payment-details-cc-exp-month');
        var cc_exp_year = cc_container.find('#edit-panes-payment-details-cc-exp-year');
        
        // Make sure that when the page is being loaded the paymentMethod value is reset
        // Browser or other caching might do otherwise.
        $("[name='panes[payment-stripe][details][stripe_payment_method]']").val('default');

        // JS must enable the button; otherwise form might disclose cc info. It starts disabled
        submitButton.attr('disabled', false);

        // When this behavior fires, we can clean the form so it will behave properly,
        // Remove 'name' from sensitive form elements so there's no way they can be submitted.
        cc_num.removeAttr('name').removeAttr('disabled');
        $('div.form-item-panes-payment-details-cc-number').removeClass('form-disabled');
        cc_cvv.removeAttr('name').removeAttr('disabled');
        var cc_val_val = cc_num.val();
        if (cc_val_val && cc_val_val.indexOf('Last 4')) {
          cc_num.val('');
        }
        
        
     // Custom styling can be passed to options when creating an Element.
        var style = {
          base: {
            // Add your base input styles here. For example:
            fontSize: '24px',
            color: "#000000",
            iconColor: "blue",
          }
        };
        
        // Create an instance of the card Element.
        var card = elements.create('card', {style: style});

        // Add an instance of the card Element into the #stripe-card-element <div>.
        card.mount(stripe_card_element);
        
        // Display errors from stripe
        card.addEventListener('change', function(event) {
          var displayError = document.getElementById('uc_stripe_messages');
          if (event.error) {
            displayError.textContent = event.error.message;
            console.log(event.error.message)
          } else {
            displayError.textContent = '';
          }
        });

        submitButton.click(function (e) {

          // We must find the various fields again, because they may have been swapped
          // in by ajax action of the form.
          cc_container = $('.payment-details-credit');
          cc_num = cc_container.find(':input[id*="edit-panes-payment-details-cc-numbe"]');
          cc_cvv = cc_container.find(':input[id*="edit-panes-payment-details-cc-cv"]');
          cc_exp_year = cc_container.find('#edit-panes-payment-details-cc-exp-month');
          cc_exp_month = cc_container.find('#edit-panes-payment-details-cc-exp-year');

          // If not credit card processing or no payment method field, just let the submit go on
          // Also continue if we've received the tokenValue
          var paymentMethodField = $("[name='panes[payment-stripe][details][stripe_payment_method]']");
          if (!$("div.payment-details-credit").length || !paymentMethodField.length || paymentMethodField.val().indexOf('pm_') == 0) {
            return true;
          }

          // If we've requested and are waiting for token, prevent any further submit
          if (paymentMethodField.val() == 'requested') {
            return false; // Prevent any submit processing until token is received
          }

          // Go ahead and request the token
          paymentMethodField.val('requested');

          try {
            
            stripe.createPaymentMethod('card', card).then(function (response) {

              if (response.error) {

                // Show the errors on the form
                $('#uc_stripe_messages')
                  .removeClass("hidden")
                  .text(response.error.message);
                $('#edit-stripe-messages').val(response.error.message);

                // Make the fields visible again for retry
                cc_num
                  .css('visibility', 'visible')
                  .val('')
                  .attr('name', 'panes[payment][details][cc_number]');
                cc_cvv
                  .css('visibility', 'visible')
                  .val('')
                  .attr('name', 'panes[payment][details][cc_cvv]');


                // Turn off the throbber
                $('.ubercart-throbber').remove();
                // Remove the bogus copy of the submit button added in uc_cart.js ucSubmitOrderThrobber
                submitButton.next().remove();
                // And show the hidden original button which has the behavior attached to it.
                submitButton.show();

                paymentMethodField.val('default'); // Make sure token field set back to default

              } else {
                // token contains id, last4, and card type
                var paymentMethodId = response.paymentMethod.id;
                
                
                // Insert the token into the form so it gets submitted to the server
                paymentMethodField.val(paymentMethodId);
                
                // set cc expiration date received from stripe so that it is available on checkout review
                cc_exp_year.val(response.paymentMethod.card.exp_month);
                cc_exp_month.val(response.paymentMethod.card.exp_year);
                
                // Since we're now submitting, make sure that uc_credit doesn't
                // find values it objects to; after "fixing" set the name back on the
                // form element.
                // add dummy tweleve 5's and the last 4 of credit card so that last 4 show
                cc_num
                  .css('visibility', 'hidden')
                  .val('555555555555' + response.paymentMethod.card.last4)
                  .attr('name', 'panes[payment][details][cc_number]');
                cc_cvv
                  .css('visibility', 'hidden')
                  .val('999')
                  .attr('name', 'panes[payment][details][cc_cvv]');

                // now actually submit to Drupal. The only "real" things going
                // are the token and the expiration date and last 4 of cc
                submitButton.click();
              }
            });
          } catch (e) {
            $('#uc_stripe_messages')
              .removeClass("hidden")
              .text(e.message);
            $('#edit-stripe-messages').val(e.message);
          }

          // Prevent processing until we get the token back
          return false;
        });
      });
      
    },

  };

}(jQuery));
