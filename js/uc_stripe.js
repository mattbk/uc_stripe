/**
 * @file
 * uc_stripe.js
 *
 * Handles all interactions with Stripe on the client side for PCI-DSS compliance
 */
(function ($) {

  Drupal.behaviors.uc_stripe = {
    attach: function (context) {

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

      var cc_container = $('.payment-details-credit');
      var cc_num = cc_container.find(':input[id*="edit-panes-payment-details-cc-numbe"]');
      var cc_cvv = cc_container.find(':input[id*="edit-panes-payment-details-cc-cv"]');

      // Make sure that when the page is being loaded the token value is reset
      // Browser or other caching might do otherwise.
      $("[name='panes[payment][details][stripe_token]']").val('default');

      $('span#stripe-nojs-warning').parent().hide();

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

      submitButton.click(function (e) {

        // We must find the various fields again, because they may have been swapped
        // in by ajax action of the form.
        cc_container = $('.payment-details-credit');
        cc_num = cc_container.find(':input[id*="edit-panes-payment-details-cc-numbe"]');
        cc_cvv = cc_container.find(':input[id*="edit-panes-payment-details-cc-cv"]');

        // If not credit card processing or no token field, just let the submit go on
        // Also continue if we've received the tokenValue
        var tokenField = $("[name='panes[payment][details][stripe_token]']");
        if (!$("div.payment-details-credit").length || !tokenField.length || tokenField.val().indexOf('tok_') == 0) {
          return true;
        }

        // If we've requested and are waiting for token, prevent any further submit
        if (tokenField.val() == 'requested') {
          return false; // Prevent any submit processing until token is received
        }

        // Go ahead and request the token
        tokenField.val('requested');

        try {
          var name = undefined;

          if ($(':input[name="panes[billing][billing_first_name]"]').length) {
            name = $(':input[name="panes[billing][billing_first_name]"]').val() + " " + $(':input[name="panes[billing][billing_last_name]"]').val();
          }
          if (typeof name === "undefined" && $(':input[name="panes[delivery][delivery_first_name]"]').length) {
            name = $(':input[name="panes[delivery][delivery_first_name]"]').val() + " " + $(':input[name="panes[delivery][delivery_last_name]"]').val();
          }

          var params = {
            number: cc_num.val(),
            cvc: cc_cvv.val(),
            exp_month: $(':input[name="panes[payment][details][cc_exp_month]"]').val(),
            exp_year: $(':input[name="panes[payment][details][cc_exp_year]"]').val(),
            name: name
          };

          // Translate the Ubercart billing/shipping fields to Stripe values
          for (var key in address_field_mapping) {
            const prefixes = ['billing', 'delivery'];
            for (var i = 0; i < prefixes.length; i++) {
              var prefix = prefixes[i];
              var uc_field_name = prefix + '_' + address_field_mapping[key];
              var location = ':input[name="panes[' + prefix + '][' + uc_field_name + ']"]';
              if ($(location).length) {
                params[key] = $(location).val();
                if ($(location).attr('type') == 'select-one') {
                  params[key] = $(location + " option:selected").text();
                }
                break;  // break out of billing/shipping loop because we got the info
              }
            }
          }

          Stripe.createToken(params, function (status, response) {

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

              tokenField.val('default'); // Make sure token field set back to default

            } else {
              // token contains id, last4, and card type
              var token = response.id;

              // Insert the token into the form so it gets submitted to the server
              tokenField.val(token);

              // Since we're now submitting, make sure that uc_credit doesn't
              // find values it objects to; after "fixing" set the name back on the
              // form element.
              cc_num
                .css('visibility', 'hidden')
                .val('555555555555' + response.card.last4)
                .attr('name', 'panes[payment][details][cc_number]');
              cc_cvv
                .css('visibility', 'hidden')
                .val('999')
                .attr('name', 'panes[payment][details][cc_cvv]');

              // now actually submit to Drupal. The only "real" things going
              // are the token and the expiration date.
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
    }
  };

}(jQuery));
