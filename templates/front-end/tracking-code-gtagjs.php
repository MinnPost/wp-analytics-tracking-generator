<?php
/**
 * The template for gtag.js code
 *
 * @package WP Analytics Tracking Generator
 */
?>
<!-- Begin WP Analytics Tracking Generator gtag.js code -->
<script async src="https://www.googletagmanager.com/gtag/js?id=<?php echo esc_attr( $property_id ); ?>"></script>
<script>
	window.dataLayer = window.dataLayer || [];
	function gtag(){dataLayer.push(arguments);}
	gtag( 'js', new Date() );
	<?php if ( true !== $disable_pageview ) : ?>
		gtag( 'config', '<?php echo esc_attr( $property_id ); ?>', <?php echo $tracking_config_json; ?> );
	<?php endif; ?>
	<?php if ( '' !== $google_ads_id ) : ?>
		gtag( 'config', '<?php echo esc_attr( $google_ads_id ); ?>' );
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
