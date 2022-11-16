<?php
/**
 * The template for gtag.js code
 *
 * @package WP Analytics Tracking Generator
 */
?>
<?php if ( ! empty( $tracking_codes_include ) ) : ?>
	<!-- Begin WP Analytics Tracking Generator gtag.js code -->
	<?php if ( in_array( 'universal', $tracking_codes_include, true ) ) : ?>
		<script async src="https://www.googletagmanager.com/gtag/js?id=<?php echo esc_attr( $property_id ); ?>"></script>
	<?php endif; ?>
	<?php if ( in_array( 'ga4', $tracking_codes_include, true ) ) : ?>
		<script async src="https://www.googletagmanager.com/gtag/js?id=<?php echo esc_attr( $property_id_ga4 ); ?>"></script>
	<?php endif; ?>
	<script>
	window.dataLayer = window.dataLayer || [];
	function gtag(){dataLayer.push(arguments);}
	gtag( 'js', new Date() );
	<?php if ( true !== $disable_pageview ) : ?>
		<?php if ( in_array( 'universal', $tracking_codes_include, true ) ) : ?>
			gtag( 'config', '<?php echo esc_attr( $property_id ); ?>', <?php echo $tracking_config_json; ?> );
		<?php endif; ?>
		<?php if ( in_array( 'ga4', $tracking_codes_include, true ) ) : ?>
			gtag( 'config', '<?php echo esc_attr( $property_id_ga4 ); ?>', <?php echo $tracking_config_json; ?> );
		<?php endif; ?>
	<?php endif; ?>
	<?php if ( '' !== $google_ads_id ) : ?>
	gtag( 'config', '<?php echo esc_attr( $google_ads_id ); ?>' );
	<?php endif; ?>
	<?php if ( false === $enable_extra_reports ) : ?>
	gtag('set', 'allow_ad_personalization_signals', false);
	<?php endif; ?>
	<?php if ( ! empty( $custom_dimensions ) ) : ?>
	gtag( 'set', {
		<?php foreach ( $custom_dimensions as $key => $value ) : ?>
			<?php if ( ! next( $custom_dimensions ) ) : ?>
	'dimension<?php echo esc_attr( $key ); ?>': '<?php echo esc_html( $value ); ?>'
	<?php else : ?>
	'dimension<?php echo esc_attr( $key ); ?>': '<?php echo esc_html( $value ); ?>',
	<?php endif; ?>
	<?php endforeach; ?>
	});
	<?php endif; ?>
	</script>
	<!-- End WP Analytics Tracking Generator gtag.js code -->
<?php endif; ?>