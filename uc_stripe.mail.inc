<?php

/**
 * This function returns the default off session authention email text.
 * @return $text - Email text
 */
function _uc_stripe_get_authentication_required_email_text(){
  $text = t("Dear [user:name],

We were unable to process your subscription payment.

Your financial institution is requesting additional verification before your subscription can be renewed.

Please visit this link to return to our site and complete the verification step.

[uc_stripe:verification-link]

-- [site:name] team

");

  return $text;
}

/**
 *
 * Token callback that adds the authentication link to user mails.
 *
 * This function is used by the token_replace() call in uc_stripe_mail() to add
 * the url to verify payment information
 *
 * @param $replacements
 *   An associative array variable containing mappings from token names to
 *   values (for use with strtr()).
 * @param $data
 *   An associative array of token replacement values.
 * @param $options
 *   Unused parameter required by the token_replace() function. */
function uc_stripe_mail_tokens(&$replacements, $data, $options) {
  global $base_url;
  $replacements['[uc_stripe:verification-link]'] = $base_url.'/stripe/authenticate-payment/'.$data['authentication_key'];
}

/**
 * Implements hook_mail().
 *
 * Send mail and replace token with authenticaion link.
 */
function uc_stripe_mail($key, &$message, $params) {

  switch ($key) {
    case 'authentication_required' :

      $message['subject'] = t('Additional Verification Required to Process Subscription.');
      $variables = array('user' => $params['user'], 'authentication_key' => $params['hash']);

      $message['body'][]= token_replace($params['body'], $variables, array('language' => language_default(), 'callback' => 'uc_stripe_mail_tokens', 'sanitize' => FALSE, 'clear' => TRUE));

      break;
  }

}